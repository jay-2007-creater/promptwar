import type {
  ConsumptionRecord,
  DataQualityWarning,
  RejectedRecord,
} from "@/types";

/**
 * CSV import for EcoPilot AI.
 *
 * Documented schema: `date,electricity_kwh,water_liters,cost_inr`
 *   - `date`            required, ISO `yyyy-mm-dd` preferred
 *   - `electricity_kwh` required, number >= 0
 *   - `water_liters`    required, number >= 0
 *   - `cost_inr`        optional measured cost; when absent, cost is derived from the
 *                       configured electricity rate and labelled as an estimate.
 *
 * Validation policy (deliberately explicit — nothing is silently repaired):
 *   - Empty columns are rejected for required fields. Missing values are NEVER replaced with zero.
 *   - Negative consumption values are rejected.
 *   - Duplicate dates keep the FIRST occurrence; later duplicates are rejected and reported.
 *   - Fully blank rows are skipped and counted separately from rejected rows.
 *   - Malformed rows are rejected individually with a row number and reason, so the user can fix and retry.
 */

export const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_DATA_ROWS = 50000;
const PREVIEW_ROWS = 8;

export const REQUIRED_COLUMNS = ["date", "electricity_kwh", "water_liters"] as const;
export const OPTIONAL_COLUMNS = ["cost_inr"] as const;
export const ACCEPTED_HEADERS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];

export interface PreviewRow {
  row: number;
  cells: Record<string, string>;
  accepted: boolean;
  issue?: string;
}

export interface ParseResult {
  ok: boolean;
  fatalError?: string;
  records: ConsumptionRecord[];
  rejected: RejectedRecord[];
  warnings: DataQualityWarning[];
  preview: PreviewRow[];
  detectedColumns: string[];
  missingColumns: string[];
  emptyRows: number;
  totalDataRows: number;
  hasCostColumn: boolean;
  delimiter: string;
  parseDurationMs: number;
}

const DELIMITERS = [",", ";", "\t"];

function detectDelimiter(headerLine: string): string {
  let best = ",";
  let bestCount = -1;
  for (const d of DELIMITERS) {
    const count = headerLine.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

function tokenize(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, "_");
}

/** Accepts ISO and unambiguous day-first forms. Returns null when the value is not a real calendar date. */
export function parseDateValue(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  let y: number;
  let m: number;
  let d: number;
  let match = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (match) {
    y = Number(match[1]);
    m = Number(match[2]);
    d = Number(match[3]);
  } else {
    match = value.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (!match) return null;
    // Day-first is the documented interpretation for non-ISO input.
    d = Number(match[1]);
    m = Number(match[2]);
    y = Number(match[3]);
  }

  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function parseNumberValue(raw: string): number | null {
  const cleaned = raw.trim().replace(/[₹,\s]/g, "").replace(/inr/gi, "");
  if (!cleaned) return null;
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function emptyResult(started: number, fatalError: string): ParseResult {
  return {
    ok: false,
    fatalError,
    records: [],
    rejected: [],
    warnings: [],
    preview: [],
    detectedColumns: [],
    missingColumns: [],
    emptyRows: 0,
    totalDataRows: 0,
    hasCostColumn: false,
    delimiter: ",",
    parseDurationMs: performance.now() - started,
  };
}

export function parseCsv(text: string, fileName = "upload.csv"): ParseResult {
  const started = performance.now();
  const cleaned = text.replace(/^\uFEFF/, "");

  if (!cleaned.trim()) {
    return emptyResult(started, "The file is empty. Nothing was imported.");
  }

  const firstLine = cleaned.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = detectDelimiter(firstLine);
  const rows = tokenize(cleaned, delimiter);

  const headerCells = (rows[0] ?? []).map(normalizeHeader);
  const dataRows = rows.slice(1);

  const detectedColumns = headerCells.filter(Boolean);
  const missingColumns = REQUIRED_COLUMNS.filter((c) => !headerCells.includes(c));

  if (missingColumns.length > 0) {
    return {
      ...emptyResult(started, ""),
      ok: false,
      fatalError: `Missing required column${missingColumns.length > 1 ? "s" : ""}: ${missingColumns.join(
        ", ",
      )}. Expected header: date, electricity_kwh, water_liters[, cost_inr].`,
      detectedColumns,
      missingColumns,
      delimiter,
    };
  }

  if (dataRows.length > MAX_DATA_ROWS) {
    return {
      ...emptyResult(
        started,
        `File contains ${dataRows.length.toLocaleString()} rows, which exceeds the ${MAX_DATA_ROWS.toLocaleString()} row processing limit. Split the file and retry.`,
      ),
      detectedColumns,
      delimiter,
    };
  }

  const indexOf = (name: string) => headerCells.indexOf(name);
  // Keyed by the canonical header names so `cell(name)` can look columns up directly.
  const idx = {
    date: indexOf("date"),
    electricity_kwh: indexOf("electricity_kwh"),
    water_liters: indexOf("water_liters"),
    cost_inr: indexOf("cost_inr"),
  };
  const hasCostColumn = idx.cost_inr >= 0;

  const records: ConsumptionRecord[] = [];
  const rejected: RejectedRecord[] = [];
  const warnings: DataQualityWarning[] = [];
  const preview: PreviewRow[] = [];
  const seenDates = new Map<string, number>();
  let emptyRows = 0;
  let futureDated = 0;
  let derivedCostRows = 0;
  let zeroElectricity = 0;

  const tomorrow = new Date();
  tomorrow.setHours(23, 59, 59, 999);

  dataRows.forEach((cells, i) => {
    const rowNumber = i + 2; // 1-based with header offset
    const rawLine = cells.join(delimiter);

    const cell = (name: string) => {
      const columnIndex = idx[name as keyof typeof idx];
      return columnIndex >= 0 ? (cells[columnIndex] ?? "") : "";
    };

    const previewCells: Record<string, string> = {};
    ACCEPTED_HEADERS.forEach((h) => {
      previewCells[h] = cell(h);
    });
    const pushPreview = (accepted: boolean, issue?: string) => {
      if (preview.length < PREVIEW_ROWS) {
        preview.push({ row: rowNumber, cells: previewCells, accepted, issue });
      }
    };

    const isBlank = cells.every((c) => !c || !c.trim());
    if (isBlank) {
      emptyRows += 1;
      pushPreview(false, "Blank row — skipped");
      return;
    }

    const dateRaw = cell("date");
    const date = parseDateValue(dateRaw);
    if (!date) {
      const reason = dateRaw.trim()
        ? `Invalid date "${dateRaw.trim()}" — expected yyyy-mm-dd`
        : "Missing required value: date";
      rejected.push({ row: rowNumber, raw: rawLine, reason });
      pushPreview(false, reason);
      return;
    }

    const electricityRaw = cell("electricity_kwh");
    const electricity = parseNumberValue(electricityRaw);
    if (electricity === null) {
      const reason = electricityRaw.trim()
        ? `electricity_kwh "${electricityRaw.trim()}" is not a valid number`
        : "Missing required value: electricity_kwh (not defaulted to 0)";
      rejected.push({ row: rowNumber, raw: rawLine, reason });
      pushPreview(false, reason);
      return;
    }
    if (electricity < 0) {
      const reason = `Negative electricity_kwh (${electricity}) — consumption cannot be negative`;
      rejected.push({ row: rowNumber, raw: rawLine, reason });
      pushPreview(false, reason);
      return;
    }

    const waterRaw = cell("water_liters");
    const water = parseNumberValue(waterRaw);
    if (water === null) {
      const reason = waterRaw.trim()
        ? `water_liters "${waterRaw.trim()}" is not a valid number`
        : "Missing required value: water_liters (not defaulted to 0)";
      rejected.push({ row: rowNumber, raw: rawLine, reason });
      pushPreview(false, reason);
      return;
    }
    if (water < 0) {
      const reason = `Negative water_liters (${water}) — consumption cannot be negative`;
      rejected.push({ row: rowNumber, raw: rawLine, reason });
      pushPreview(false, reason);
      return;
    }

    let cost = 0;
    if (hasCostColumn) {
      const costRaw = cell("cost_inr");
      if (costRaw.trim()) {
        const parsedCost = parseNumberValue(costRaw);
        if (parsedCost === null || parsedCost < 0) {
          const reason = `Invalid cost_inr "${costRaw.trim()}" — expected a number >= 0`;
          rejected.push({ row: rowNumber, raw: rawLine, reason });
          pushPreview(false, reason);
          return;
        }
        cost = parsedCost;
      } else {
        derivedCostRows += 1;
      }
    }

    if (seenDates.has(date)) {
      const reason = `Duplicate date ${date} (already present on row ${seenDates.get(
        date,
      )}); first occurrence kept`;
      rejected.push({ row: rowNumber, raw: rawLine, reason });
      pushPreview(false, reason);
      return;
    }
    seenDates.set(date, rowNumber);
    if (new Date(date) > tomorrow) futureDated += 1;
    if (electricity === 0) zeroElectricity += 1;

    records.push({
      date,
      electricityKwh: electricity,
      waterLiters: water,
      costInr: cost,
    });
    pushPreview(true);
  });

  records.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  if (futureDated > 0) {
    warnings.push({
      code: "future_dates",
      count: futureDated,
      message: `${futureDated} accepted record${
        futureDated > 1 ? "s fall" : " falls"
      } after today's date. Kept, but verify the source file.`,
    });
  }
  if (derivedCostRows > 0) {
    warnings.push({
      code: "partial_cost",
      count: derivedCostRows,
      message: `${derivedCostRows} row${
        derivedCostRows > 1 ? "s have" : " has"
      } no cost_inr value. Expenditure for those rows is estimated from the configured rate.`,
    });
  }
  if (zeroElectricity > 0) {
    warnings.push({
      code: "zero_electricity",
      count: zeroElectricity,
      message: `${zeroElectricity} record${
        zeroElectricity > 1 ? "s have" : " has"
      } exactly 0 kWh. Kept as measured (e.g. unoccupied period) — verify the meter reading.`,
    });
  }
  if (records.length > 0 && records.length < 5) {
    warnings.push({
      code: "small_sample",
      count: records.length,
      message: `Only ${records.length} valid record${
        records.length > 1 ? "s" : ""
      } detected. Averages and trend estimates are unreliable below 5 records.`,
    });
  }
  if (missingColumns.length === 0 && !hasCostColumn) {
    warnings.push({
      code: "no_cost_column",
      message:
        "No cost_inr column found. Estimated expenditure is derived from the configured electricity rate.",
    });
  }

  const ok = records.length > 0;
  return {
    ok,
    fatalError: ok
      ? undefined
      : `No valid records were accepted from ${fileName}. Every data row failed validation — see the rejected-row report below.`,
    records,
    rejected,
    warnings,
    preview,
    detectedColumns,
    missingColumns,
    emptyRows,
    totalDataRows: dataRows.length,
    hasCostColumn,
    delimiter,
    parseDurationMs: performance.now() - started,
  };
}
