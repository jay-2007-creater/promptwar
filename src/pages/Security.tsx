import { useMemo } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Cloud,
  Database,
  FileCheck2,
  KeyRound,
  Lock,
  MinusCircle,
  Network,
  ScrollText,
  ServerCog,
  ShieldCheck,
  Timer,
  UserRoundCheck,
  XCircle,
} from "lucide-react";
import type { SecurityControl } from "@/types";
import { getAgentEndpoint, REQUEST_TIMEOUT_MS } from "@/services/api";
import { isPersistenceAvailable, STORAGE_KEYS } from "@/services/persistence";
import { MAX_DATA_ROWS, MAX_FILE_BYTES } from "@/services/csvParser";
import { TOOL_NAMES } from "@/types";
import { useAgentHealth } from "@/hooks/useAgentHealth";
import { Card, CardHeader, MethodNote, SectionHeading } from "@/components/ui/Card";
import { Pill, SecurityStatusPill } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/Feedback";
import { cn } from "@/lib/utils";

type Status = SecurityControl["status"];

export default function Security() {
  const { health, backendConfigured } = useAgentHealth();
  const endpoint = getAgentEndpoint();
  const persistenceAvailable = isPersistenceAvailable();

  const controls = useMemo<SecurityControl[]>(() => {
    const endpointSecured = endpoint?.startsWith("https://") ?? false;

    const connectivity: Status = !backendConfigured
      ? "not_configured"
      : health?.connected
        ? "verified"
        : health
          ? "unavailable"
          : "not_verified";

    return [
      {
        id: "credential-isolation",
        category: "Credentials",
        name: "Server-side API key protection",
        description:
          "No model API key exists anywhere in the client: not in source, not in the bundle, not in browser storage. The Gemini key can only be read by the deployed backend from its own environment.",
        status: "verified",
        note: "The only client-side configuration value is a non-secret endpoint URL (VITE_AGENT_API_URL).",
      },
      {
        id: "browser-storage",
        category: "Credentials",
        name: "No credentials in browser storage",
        description: `Persisted keys are limited to ${Object.values(STORAGE_KEYS).join(", ")} — settings, imported datasets, plan statuses, the execution log and conversation state.`,
        status: persistenceAvailable ? "verified" : "unavailable",
        note: persistenceAvailable
          ? "Credential fields do not exist in the persisted state shape, so none can leak into localStorage."
          : "Browser storage is blocked, so the app is running from an in-memory store for this session.",
      },
      {
        id: "agent-input-validation",
        category: "Input validation",
        name: "Agent request validation",
        description:
          "Requests carry a typed contract (requestId, message, datasetId, context, bounded history). Tool arguments are validated against per-tool schemas before any execution happens.",
        status: "verified",
        note: "Out-of-range arguments such as reductionPercent = 250 are refused with a reason instead of being clamped silently.",
      },
      {
        id: "csv-validation",
        category: "Input validation",
        name: "CSV file validation",
        description:
          "Required columns, date formats, numeric formats and negative values are all validated. Rejected rows are reported individually with row numbers; missing values are never replaced with zero.",
        status: "verified",
        note: `Client limits: ${MAX_FILE_BYTES / (1024 * 1024)} MB per file, ${MAX_DATA_ROWS.toLocaleString()} data rows, first-occurrence-wins duplicate policy.`,
      },
      {
        id: "client-limits",
        category: "Limits",
        name: "Client-side processing limits",
        description:
          "File size, row count and request timeout are all bounded before work starts, so a hostile or accidental input cannot exhaust browser memory.",
        status: "verified",
        note: `Agent requests time out after ${Math.round(REQUEST_TIMEOUT_MS / 1000)} s; health probes after 4 s.`,
      },
      {
        id: "server-limits",
        category: "Limits",
        name: "Server-side request-size limit",
        description:
          "A deployed backend must reject oversized payloads before parsing them. This cannot be enforced from the browser.",
        status: "not_configured",
        note: "Requires the backend deployment (Antigravity / Cloud Run) with an explicit body-size limit.",
      },
      {
        id: "rate-limiting",
        category: "Limits",
        name: "AI endpoint rate limiting",
        description:
          "Per-client and per-user throttling on the model endpoint, so a single client cannot drive unbounded model cost.",
        status: "not_configured",
        note: "Deliberately not claimed: rate limiting belongs in the backend and is not implemented in this MVP.",
      },
      {
        id: "output-validation",
        category: "Output validation",
        name: "Agent response validation",
        description:
          "A backend reply is checked against the expected contract before being rendered. Malformed JSON or a missing summary/actions array raises an invalid-response error and the turn falls back rather than displaying unvalidated content.",
        status: "verified",
        note: "Locally produced results are typed objects built by the engine, not free-form text.",
      },
      {
        id: "tool-surface",
        category: "Agent containment",
        name: "Restricted agent tools",
        description: `The agent can reach exactly ${TOOL_NAMES.length} approved analytical tools: ${TOOL_NAMES.join(", ")}. There is no shell execution, no dynamic code evaluation, and no unrestricted network access.`,
        status: "verified",
        note: "Tool selection and execution are verified through the registry, which rejects unknown tool names.",
      },
      {
        id: "error-handling",
        category: "Resilience",
        name: "Safe error handling",
        description:
          "Failures surface as user-facing messages with a fallback path. Errors never include credentials, and a failed turn produces no partial result that could be mistaken for a finding.",
        status: "verified",
        note: `Agent failure paths: network, timeout, HTTP error, invalid response, unsupported objective, missing dataset.`,
      },
      {
        id: "authentication",
        category: "Identity",
        name: "Authentication",
        description:
          "The MVP runs as a single local workspace with an explicitly labelled demo-user indicator. No sign-in is implemented.",
        status: "not_configured",
        note: "Firebase Authentication is the planned path; until then every page labels the session as a demo workspace.",
      },
      {
        id: "persistence",
        category: "Data handling",
        name: "Persistence configuration",
        description:
          "Data stays in this browser through one isolated persistence module. Swapping it for Cloud Firestore requires no change to components.",
        status: persistenceAvailable ? "verified" : "unavailable",
        note: "No server-side persistence exists yet, so no cloud data-retention or access-control rules are claimed.",
      },
      {
        id: "connectivity",
        category: "Integrations",
        name: "External service connectivity",
        description: backendConfigured
          ? `An agent endpoint is configured at ${endpoint}. Connectivity is reported only after a successful health response.`
          : "No agent endpoint is configured, so no external service is contacted at all. Analysis runs entirely in this browser.",
        status: connectivity,
        note: health?.detail ?? "Connection status has not been probed yet.",
      },
      {
        id: "transport",
        category: "Integrations",
        name: "Transport security to the backend",
        description: endpointSecured
          ? "The configured endpoint uses HTTPS, so agent payloads are encrypted in transit."
          : backendConfigured
            ? "The configured endpoint is not HTTPS. Model payloads would travel in clear text."
            : "No endpoint is configured, so there is no outbound model traffic to protect.",
        status: endpointSecured ? "verified" : backendConfigured ? "not_verified" : "not_configured",
        note: endpoint
          ? `Endpoint scheme: ${endpoint.split("://")[0]}`
          : "Set an https:// endpoint when the backend is deployed.",
      },
    ];
  }, [backendConfigured, endpoint, health, persistenceAvailable]);

  const verified = controls.filter((control) => control.status === "verified").length;
  const posture = controls.length > 0 ? (verified / controls.length) * 100 : 0;
  const notConfigured = controls.filter((control) => control.status === "not_configured").length;

  const categories = useMemo(() => {
    const map = new Map<string, SecurityControl[]>();
    controls.forEach((control) => {
      map.set(control.category, [...(map.get(control.category) ?? []), control]);
    });
    return [...map.entries()];
  }, [controls]);

  return (
    <>
      <SectionHeading
        eyebrow="Security Center"
        title="Control status and data-handling posture"
        description="Each control below is reported from what this build actually implements. A control is never marked verified because an interface for it exists — if it depends on a backend that is not deployed, it says so."
        actions={
          <Pill tone={backendConfigured ? "mint" : "amber"}>

            {backendConfigured ? "Backend endpoint configured" : "No backend endpoint configured"}
          </Pill>
        }
      />

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-4">
          <CardHeader
            title="Posture summary"
            caption="Counted across every control on this page"
            icon={<ShieldCheck size={15} />}
          />
          <div className="space-y-4 p-4 md:p-5">
            <div>
              <div className="flex items-baseline justify-between">
                <p className="text-2xs text-faint">Verified controls</p>
                <p className="num text-sm font-semibold text-ink">
                  {verified}
                  <span className="text-faint"> / {controls.length}</span>
                </p>
              </div>
              <ProgressBar value={posture} className="mt-2" />
            </div>
            <ul className="space-y-2 text-xs">
              {(
                [
                  ["verified", verified],
                  ["not_configured", notConfigured],
                  [
                    "not_verified",
                    controls.filter((control) => control.status === "not_verified").length,
                  ],
                  [
                    "unavailable",
                    controls.filter((control) => control.status === "unavailable").length,
                  ],
                ] as Array<[Status, number]>
              ).map(([status, count]) => (
                <li key={status} className="flex items-center justify-between gap-3">
                  <SecurityStatusPill status={status} />
                  <span className="num text-muted">{count}</span>
                </li>
              ))}
            </ul>
            <MethodNote label="How are these statuses determined?">
              Verified means the control is enforced by code that runs in this build. Not configured means the
              control depends on infrastructure that has not been deployed yet. Not verified means the
              mechanism exists but its guarantee cannot be confirmed here. Unavailable means the environment
              prevents it.
            </MethodNote>
          </div>
        </Card>

        <Card className="xl:col-span-8">
          <CardHeader
            title="Controls"
            caption="Grouped by category"
            icon={<Lock size={15} />}
          />
          <div className="divide-y divide-line">
            {categories.map(([category, items]) => (
              <div key={category} className="px-4 py-4 md:px-5">
                <p className="label-micro mb-3">{category}</p>
                <ul className="space-y-3">
                  {items.map((control) => (
                    <li key={control.id}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <StatusIcon status={control.status} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-ink">{control.name}</p>
                            <p className="mt-1 text-xs leading-relaxed text-muted">{control.description}</p>
                            <p className="mt-1 text-2xs leading-relaxed text-faint">{control.note}</p>
                          </div>
                        </div>
                        <SecurityStatusPill status={control.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader
            title="Credential handling"
            caption="Where a model key may and may not live"
            icon={<KeyRound size={15} />}
          />
          <ul className="row-divide text-xs leading-relaxed text-muted">
            {[
              "Never paste an API key into any field in this application. No input exists for credentials, by design.",
              "Keys belong in the backend environment (for example a Cloud Run secret), read server-side at request time.",
              "Vite environment variables are compiled into the browser bundle. They are safe only for non-secret values such as a public endpoint URL.",
              "Do not commit keys to the repository, and do not place them in .env files that are tracked by git.",
            ].map((line) => (
              <li key={line} className="flex gap-2 px-4 py-3 md:px-5">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand/70" />
                {line}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Data handling"
            caption="What is stored, and where"
            icon={<Database size={15} />}
          />
          <ul className="row-divide text-xs leading-relaxed text-muted">
            {[
              "Imported datasets stay in this browser's local storage. Nothing is uploaded by this MVP.",
              "The sample dataset is generated locally from a fixed seed and contains no real household or organisation.",
              "Clearing local data in Settings removes every imported dataset, plan status, conversation and execution record.",
              "Agent context sent to a backend is limited to aggregate measurements and the active dataset id — never credentials.",
            ].map((line) => (
              <li key={line} className="flex gap-2 px-4 py-3 md:px-5">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand/70" />
                {line}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Required before production"
            caption="Honest gap list for this MVP"
            icon={<ServerCog size={15} />}
          />
          <ul className="row-divide text-xs leading-relaxed text-muted">
            {[
              { icon: <UserRoundCheck size={12} />, text: "Authenticate users and scope datasets per identity (Firebase Auth)." },
              { icon: <Timer size={12} />, text: "Enforce per-user rate limiting and quotas on the model endpoint." },
              { icon: <Cloud size={12} />, text: "Move persistence to Firestore with security rules, replacing local storage." },
              { icon: <Network size={12} />, text: "Allow-list outbound network access from the backend only." },
              { icon: <ScrollText size={12} />, text: "Add an audit log for tool executions and administrative actions." },
            ].map((item) => (
              <li key={item.text} className="flex gap-2 px-4 py-3 md:px-5">
                <span className="mt-0.5 shrink-0 text-amber-400">{item.icon}</span>
                {item.text}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Agent containment model"
          caption="Why a compromised prompt cannot escalate into arbitrary execution"
          icon={<Ban size={15} />}
        />
        <div className="grid gap-4 p-4 md:p-5 lg:grid-cols-2">
          <ul className="space-y-2 text-xs leading-relaxed text-muted">
            <li className="flex gap-2">
              <FileCheck2 size={13} className="mt-0.5 shrink-0 text-brand" />
              Tool names are typed literals. An unknown name is rejected by the registry lookup, so the agent
              cannot invent a capability.
            </li>
            <li className="flex gap-2">
              <FileCheck2 size={13} className="mt-0.5 shrink-0 text-brand" />
              Arguments are validated per tool before execution; failures return an error instead of running
              with substituted values.
            </li>
            <li className="flex gap-2">
              <FileCheck2 size={13} className="mt-0.5 shrink-0 text-brand" />
              Tools read only from the active dataset context passed into the engine — there is no ambient
              file system, process or credential access.
            </li>
            <li className="flex gap-2">
              <FileCheck2 size={13} className="mt-0.5 shrink-0 text-brand" />
              Unsupported objectives are refused with an explanation, so an out-of-scope prompt cannot produce
              a fabricated answer.
            </li>
          </ul>
          <div className="rounded-lg border border-line bg-hairline/[0.03] px-3.5 py-3">
            <p className="label-micro mb-2">Approved tool surface</p>
            <ul className="space-y-1">
              {TOOL_NAMES.map((tool) => (
                <li key={tool} className="flex items-center gap-2 font-mono text-2xs text-muted">
                  <CheckCircle2 size={11} className="text-brand" />
                  {tool}
                </li>
              ))}
            </ul>
            <p className="mt-2.5 text-2xs leading-relaxed text-faint">
              Anything outside this list — shell commands, code evaluation, arbitrary HTTP — is
              unreachable from a turn.
            </p>
          </div>
        </div>
      </Card>
    </>
  );
}

function StatusIcon({ status }: { status: Status }) {
  const className = "mt-0.5 shrink-0";
  if (status === "verified") return <CheckCircle2 size={14} className={cn(className, "text-brand")} />;
  if (status === "unavailable") return <XCircle size={14} className={cn(className, "text-red-400")} />;
  if (status === "not_verified")
    return <MinusCircle size={14} className={cn(className, "text-amber-400")} />;
  return <AlertTriangle size={14} className={cn(className, "text-amber-400")} />;
}
