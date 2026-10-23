import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  AgentHealth,
  AgentMessage,
  AppSettings,
  Dataset,
  ExecutionLogEntry,
  PlanStatus,
  SimulationScenario,
} from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { buildSampleDataset, SAMPLE_DATASET_ID } from "@/data/sampleData";
import { createLocalStorage, STORAGE_KEYS } from "@/services/persistence";

/**
 * Single application store.
 *
 * The sample dataset is deliberately NOT part of persisted state — it is derived on read, so the
 * demo workspace can never be corrupted or lost. Only imported datasets, settings, plan status,
 * conversations and the execution log are persisted.
 */

const MAX_EXECUTIONS = 120;
const MAX_MESSAGES = 60;

interface AppState {
  settings: AppSettings;
  datasets: Dataset[];
  activeDatasetId: string;
  planStatus: Record<string, PlanStatus>;
  executions: ExecutionLogEntry[];
  messages: AgentMessage[];
  agentHealth: AgentHealth | null;
  healthCheckedAt: string | null;
  lastSimulation: SimulationScenario | null;

  setSettings: (patch: Partial<AppSettings>) => void;
  resetSettings: () => void;

  addDataset: (dataset: Dataset) => void;
  setActiveDataset: (id: string) => void;
  removeDataset: (id: string) => void;
  resetDatasets: () => void;

  setPlanStatus: (recommendationId: string, status: PlanStatus) => void;
  resetPlanStatus: () => void;

  logExecution: (entry: Omit<ExecutionLogEntry, "id" | "at"> & { id?: string; at?: string }) => void;
  clearExecutions: () => void;

  appendMessage: (message: AgentMessage) => void;
  updateMessage: (id: string, patch: Partial<AgentMessage>) => void;
  clearConversation: () => void;

  setAgentHealth: (health: AgentHealth) => void;

  setLastSimulation: (scenario: SimulationScenario | null) => void;

  resetAllLocalData: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      datasets: [],
      activeDatasetId: SAMPLE_DATASET_ID,
      planStatus: {},
      executions: [],
      messages: [],
      agentHealth: null,
      healthCheckedAt: null,
      lastSimulation: null,

      setSettings: (patch) =>
        set((state) => ({ settings: { ...state.settings, ...patch } })),
      resetSettings: () => set({ settings: DEFAULT_SETTINGS }),

      addDataset: (dataset) =>
        set((state) => ({
          datasets: [dataset, ...state.datasets.filter((d) => d.id !== dataset.id)],
          activeDatasetId: dataset.id,
        })),

      setActiveDataset: (id) => set({ activeDatasetId: id }),

      removeDataset: (id) =>
        set((state) => ({
          datasets: state.datasets.filter((d) => d.id !== id),
          activeDatasetId: state.activeDatasetId === id ? SAMPLE_DATASET_ID : state.activeDatasetId,
        })),

      resetDatasets: () => set({ datasets: [], activeDatasetId: SAMPLE_DATASET_ID }),

      setPlanStatus: (recommendationId, status) =>
        set((state) => ({
          planStatus: { ...state.planStatus, [recommendationId]: status },
        })),
      resetPlanStatus: () => set({ planStatus: {} }),

      logExecution: (entry) =>
        set((state) => {
          const full: ExecutionLogEntry = {
            id: entry.id ?? `exec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
            at: entry.at ?? new Date().toISOString(),
            ...entry,
          } as ExecutionLogEntry;
          return { executions: [full, ...state.executions].slice(0, MAX_EXECUTIONS) };
        }),
      clearExecutions: () => set({ executions: [] }),

      appendMessage: (message) =>
        set((state) => ({ messages: [...state.messages, message].slice(-MAX_MESSAGES) })),
      updateMessage: (id, patch) =>
        set((state) => ({
          messages: state.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        })),
      clearConversation: () => set({ messages: [] }),

      setAgentHealth: (health) =>
        set({ agentHealth: health, healthCheckedAt: new Date().toISOString() }),

      setLastSimulation: (scenario) => set({ lastSimulation: scenario }),

      resetAllLocalData: () =>
        set({
          settings: DEFAULT_SETTINGS,
          datasets: [],
          activeDatasetId: SAMPLE_DATASET_ID,
          planStatus: {},
          executions: [],
          messages: [],
          agentHealth: null,
          healthCheckedAt: null,
        }),
    }),
    {
      name: STORAGE_KEYS.app,
      version: 1,
      storage: createJSONStorage(() => createLocalStorage()),
      partialize: (state) => ({
        settings: state.settings,
        datasets: state.datasets,
        activeDatasetId: state.activeDatasetId,
        planStatus: state.planStatus,
        executions: state.executions,
        messages: state.messages,
        lastSimulation: state.lastSimulation,
      }),
    },
  ),
);

/** The sample dataset is always available and is never persisted. */
export function useAllDatasets(): Dataset[] {
  const imported = useAppStore((s) => s.datasets);
  return [buildSampleDataset(), ...imported];
}

export function useActiveDataset(): Dataset | null {
  const imported = useAppStore((s) => s.datasets);
  const activeId = useAppStore((s) => s.activeDatasetId);
  if (activeId === SAMPLE_DATASET_ID) return buildSampleDataset();
  return imported.find((d) => d.id === activeId) ?? null;
}

export { SAMPLE_DATASET_ID };
