/**
 * Presentation-only formatting helpers. Kept separate from the calculation layer so
 * rounding/display decisions never leak into stored data.
 */

const nf = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const nf2 = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatNumber(value: number, decimals: 0 | 1 | 2 = 0): string {
  if (!Number.isFinite(value)) return "—";
  if (decimals === 0) return nf.format(value);
  if (decimals === 1) return nf1.format(value);
  return nf2.format(value);
}

export function formatInr(value: number, decimals: 0 | 2 = 0): string {
  if (!Number.isFinite(value)) return "—";
  return `₹${decimals === 0 ? nf.format(value) : nf2.format(value)}`;
}

export function formatPercent(value: number, decimals: 1 | 2 = 1): string {
  if (!Number.isFinite(value)) return "—";
  const formatted =
    decimals === 1 ? nf1.format(Math.abs(value)) : nf2.format(Math.abs(value));
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatted}%`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  if (ms < 1) return "<1 ms";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${nf2.format(ms / 1000)} s`;
}

export function formatDateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function formatDateLong(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  if (diff < 45_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} h ago`;
  return formatDateShort(iso);
}
