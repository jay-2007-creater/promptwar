import { useCallback, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { checkAgentHealth, isBackendConfigured } from "@/services/api";

/**
 * Probes agent connectivity. When no backend endpoint is configured this resolves instantly to
 * "fallback" — the app reports that state honestly instead of showing a fake connected badge.
 */
export function useAgentHealth() {
  const agentHealth = useAppStore((s) => s.agentHealth);
  const healthCheckedAt = useAppStore((s) => s.healthCheckedAt);
  const setAgentHealth = useAppStore((s) => s.setAgentHealth);

  const refresh = useCallback(async () => {
    const health = await checkAgentHealth();
    setAgentHealth(health);
  }, [setAgentHealth]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    health: agentHealth,
    checkedAt: healthCheckedAt,
    refresh,
    backendConfigured: isBackendConfigured(),
  };
}
