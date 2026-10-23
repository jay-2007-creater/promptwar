import {
  Bot,
  Gauge,
  LayoutDashboard,
  ListChecks,
  ShieldCheck,
  SlidersHorizontal,
  Settings as SettingsIcon,
  Table2,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      {
        to: "/overview",
        label: "Overview",
        icon: LayoutDashboard,
        description: "Consumption, cost and emissions at a glance",
      },
      {
        to: "/analysis",
        label: "Data Analysis",
        icon: Table2,
        description: "Import a CSV, validate it, review computed results",
      },
      {
        to: "/agent",
        label: "AI Agent",
        icon: Bot,
        description: "Investigate with a bounded tool-calling agent",
      },
      {
        to: "/plans",
        label: "Optimization Plans",
        icon: ListChecks,
        description: "Prioritised, verifiable sustainability actions",
      },
      {
        to: "/simulator",
        label: "Impact Simulator",
        icon: SlidersHorizontal,
        description: "Model hypothetical reductions and compare outcomes",
      },
    ],
  },
  {
    label: "Performance & Security",
    items: [
      {
        to: "/performance",
        label: "Performance",
        icon: Gauge,
        description: "Measured processing, latency and reliability metrics",
      },
      {
        to: "/security",
        label: "Security",
        icon: ShieldCheck,
        description: "Control status and data-handling posture",
      },
    ],
  },
  {
    label: "Configure",
    items: [
      {
        to: "/settings",
        label: "Settings",
        icon: SettingsIcon,
        description: "Datasets, calculation factors, AI and preferences",
      },
    ],
  },
];

export const TOP_BAR_TITLES = NAV_GROUPS.flatMap((g) => g.items).reduce<
  Record<string, { label: string; description: string }>
>((acc, item) => {
  acc[item.to] = { label: item.label, description: item.description };
  return acc;
}, {});
