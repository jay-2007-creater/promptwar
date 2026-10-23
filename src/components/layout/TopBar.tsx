import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  Bot,
  Cloud,
  Cpu,
  Database,
  Info,
  Leaf,
  Menu,
  Moon,
  RefreshCw,
  Settings as SettingsIcon,
  Sun,
  Trash2,
  UserRound,
  CheckCircle2,
} from "lucide-react";
import { TOP_BAR_TITLES } from "./navItems";
import { Button, IconButton } from "@/components/ui/Button";
import { DemoBadge, Pill } from "@/components/ui/Badge";
import {
  Dropdown,
  DropdownItem,
  DropdownSection,
} from "@/components/ui/Dropdown";
import { useActiveRecords, useDerivedAnalysis } from "@/hooks/useAnalysis";
import { useAgentHealth } from "@/hooks/useAgentHealth";
import { useAppStore } from "@/store/useAppStore";
import { clearPersistedState } from "@/services/persistence";
import { cn } from "@/lib/utils";

export function TopBar({ onOpenNav }: { onOpenNav: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const page = TOP_BAR_TITLES[location.pathname];
  const { dataset } = useActiveRecords();
  const { derived } = useDerivedAnalysis();
  const { health, refresh } = useAgentHealth();
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const resetAllLocalData = useAppStore((s) => s.resetAllLocalData);

  const alerts = useMemo(() => {
    const items: Array<{
      id: string;
      tone: "warning" | "info" | "ok";
      title: string;
      detail: string;
      to?: string;
    }> = [];

    const anomalyCount = derived.summary.anomalies.length;
    if (anomalyCount > 0) {
      items.push({
        id: "anomalies",
        tone: "warning",
        title: `${anomalyCount} consumption anomal${anomalyCount === 1 ? "y" : "ies"} detected`,
        detail: "Statistical outliers require investigation — they are signals, not confirmed faults.",
        to: "/agent",
      });
    }

    (dataset?.warnings ?? []).forEach((warning, index) => {
      items.push({
        id: `warn-${index}`,
        tone: "info",
        title: warning.message.split(".")[0],
        detail: warning.message,
        to: "/analysis",
      });
    });

    if ((dataset?.rejectedCount ?? 0) > 0) {
      items.push({
        id: "rejected",
        tone: "warning",
        title: `${dataset?.rejectedCount} record${dataset?.rejectedCount === 1 ? "" : "s"} rejected on import`,
        detail: "Review the rejected-row report in Data Analysis to correct the source file.",
        to: "/analysis",
      });
    }

    if (items.length === 0) {
      items.push({
        id: "clean",
        tone: "ok",
        title: "No outstanding data issues",
        detail: "The active dataset has no warnings or flagged anomalies in this window.",
      });
    }

    return items;
  }, [derived.summary.anomalies.length, dataset]);

  const warningCount = alerts.filter((a) => a.tone === "warning").length;

  const handleResetData = () => {
    resetAllLocalData();
    clearPersistedState();
    navigate("/overview");
  };

  return (
    <header className="glass sticky top-0 z-20 border-b border-line">
      <div className="flex h-14 items-center gap-3 px-4 md:px-6">
        <button
          type="button"
          onClick={onOpenNav}
          aria-label="Open navigation"
          className="-ml-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-elevated text-muted transition-colors hover:border-brand/40 hover:text-ink lg:hidden"
        >
          <Menu size={16} />
        </button>

        <div className="flex min-w-0 items-center gap-2.5">
          <span className="hidden h-7 w-7 items-center justify-center rounded-md bg-brand/12 text-brand ring-1 ring-brand/25 lg:flex">
            <Leaf size={15} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight text-ink">
              {page?.label ?? "EcoPilot AI"}
            </p>
            <p className="hidden truncate text-2xs leading-tight text-faint sm:block">
              {page?.description ?? "Autonomous sustainability intelligence"}
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 xl:flex">
            <Pill tone="neutral" icon={<Database size={10} />}>
              <span className="max-w-[190px] truncate normal-case tracking-normal">
                {dataset ? dataset.name : "No dataset"}
              </span>
            </Pill>
            {dataset?.isDemo ? <DemoBadge /> : null}
          </div>

          <Dropdown
            align="right"
            label="Agent connection status"
            panelClassName="w-[320px]"
            trigger={({ toggle, open }) => (
              <button
                type="button"
                onClick={toggle}
                aria-label="Agent connection status"
                aria-haspopup="dialog"
                aria-expanded={open}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-2xs font-semibold uppercase tracking-[0.09em] transition-colors",
                  health?.connected
                    ? "border-brand/30 bg-brand/10 text-brand-300"
                    : "border-amber-500/25 bg-amber-500/10 text-amber-300",
                  open && "ring-1 ring-brand/30",
                )}
              >
                <Bot size={12} />
                <span className="hidden md:inline">
                  {health?.connected ? "Agent connected" : "Agent fallback"}
                </span>
              </button>
            )}
          >
            {() => (
              <>
                <DropdownSection title="Agent connection">
                  <div className="px-3.5 pb-2">
                    <Pill tone={health?.connected ? "mint" : "amber"}>
                      {health?.connected ? "Backend connected" : "Local deterministic fallback"}
                    </Pill>
                    <p className="mt-2 text-xs leading-relaxed text-muted">
                      {health?.detail ??
                        "Checking agent connectivity…"}
                    </p>
                  </div>
                </DropdownSection>
                <DropdownSection title="Execution mode">
                  <div className="space-y-1.5 px-3.5 pb-1 text-xs text-muted">
                    <p className="flex items-center gap-2">
                      <Cpu size={12} className="text-brand" />
                      Mode: {health?.connected ? "Gemini via secure backend" : "Local tool registry"}
                    </p>
                    <p className="flex items-center gap-2">
                      <Cloud size={12} className={health?.connected ? "text-brand" : "text-faint"} />
                      Endpoint: {health?.endpoint ?? "not configured"}
                    </p>
                  </div>
                </DropdownSection>
                <div className="p-2.5">
                  <Button
                    size="sm"
                    block
                    icon={<RefreshCw size={13} />}
                    onClick={() => void refresh()}
                  >
                    Re-check connection
                  </Button>
                </div>
              </>
            )}
          </Dropdown>

          <Dropdown
            align="right"
            label="Notifications"
            panelClassName="w-[340px]"
            trigger={({ toggle, open }) => (
              <button
                type="button"
                onClick={toggle}
                aria-label={
                  warningCount > 0
                    ? `Notifications, ${warningCount} requiring attention`
                    : "Notifications"
                }
                aria-haspopup="dialog"
                aria-expanded={open}
                className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-elevated text-muted transition-colors hover:text-ink"
              >
                <Bell size={15} />
                {warningCount > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-black">
                    {warningCount}
                  </span>
                ) : null}
              </button>
            )}
          >
            {({ close }) => (
              <>
                <DropdownSection title="Data & analysis notices">
                  {alerts.map((alert) => (
                    <DropdownItem
                      key={alert.id}
                      icon={
                        alert.tone === "warning" ? (
                          <AlertTriangle size={13} className="text-amber-400" />
                        ) : alert.tone === "ok" ? (
                          <CheckCircle2 size={13} className="text-brand" />
                        ) : (
                          <Info size={13} className="text-muted" />
                        )
                      }
                      onSelect={() => {
                        close();
                        if (alert.to) navigate(alert.to);
                      }}
                    >
                      <span className="block font-medium text-ink">{alert.title}</span>
                      <span className="mt-0.5 block text-2xs leading-relaxed text-faint">
                        {alert.detail}
                      </span>
                    </DropdownItem>
                  ))}
                </DropdownSection>
                <p className="px-3.5 py-2.5 text-2xs leading-relaxed text-faint">
                  Notices are derived from the active dataset. Nothing here is simulated activity.
                </p>
              </>
            )}
          </Dropdown>

          <IconButton
            label={settings.theme === "dark" ? "Switch to light interface" : "Switch to dark interface"}
            onClick={() =>
              setSettings({ theme: settings.theme === "dark" ? "light" : "dark" })
            }
          >
            {settings.theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </IconButton>

          <Dropdown
            align="right"
            label="Account menu"
            trigger={({ toggle, open }) => (
              <button
                type="button"
                onClick={toggle}
                aria-label="Account menu"
                aria-haspopup="dialog"
                aria-expanded={open}
                className="inline-flex h-8 items-center gap-2 rounded-lg border border-line bg-elevated px-2 pr-2.5 text-xs text-muted transition-colors hover:text-ink"
              >
                <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-md bg-brand/12 text-brand">
                  <UserRound size={12} />
                </span>
                <span aria-hidden className="hidden md:inline">Demo user</span>
              </button>
            )}
          >
            {({ close }) => (
              <>
                <div className="border-b border-line px-3.5 py-3">
                  <p className="text-sm font-semibold text-ink">Demo user</p>
                  <p className="mt-0.5 text-2xs leading-relaxed text-faint">
                    No authentication is implemented in this build. All data stays in this browser.
                  </p>
                </div>
                <DropdownSection>
                  <DropdownItem
                    icon={<SettingsIcon size={13} />}
                    onSelect={() => {
                      close();
                      navigate("/settings");
                    }}
                  >
                    Settings
                  </DropdownItem>
                  <DropdownItem
                    icon={<Trash2 size={13} />}
                    tone="danger"
                    onSelect={() => {
                      close();
                      handleResetData();
                    }}
                  >
                    Reset local data
                  </DropdownItem>
                </DropdownSection>
              </>
            )}
          </Dropdown>
        </div>
      </div>
    </header>
  );
}
