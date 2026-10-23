import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";

/** Keeps the document element's theme class in sync with the persisted preference. */
export function useApplyTheme() {
  const theme = useAppStore((s) => s.settings.theme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }, [theme]);
}
