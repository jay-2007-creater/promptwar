import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

/** Minimal accessible popover: closes on outside click and on Escape. */
export function Dropdown({
  trigger,
  children,
  align = "right",
  panelClassName,
  label,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (props: { close: () => void }) => ReactNode;
  align?: "left" | "right";
  panelClassName?: string;
  /** Accessible name for the panel — a dialog without a name is unusable with a screen reader. */
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Move focus into the panel on open and hand it back to the trigger on close,
  // so keyboard users are never dropped at the top of the document.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    return () => previouslyFocused?.focus?.();
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open ? (
        <div
          role="dialog"
          aria-label={label}
          style={{ boxShadow: "var(--shadow-pop)" }}
          className={cn(
            "absolute z-50 mt-2 min-w-[248px] animate-fade-up overflow-hidden rounded-card border border-line bg-elevated",
            align === "right" ? "right-0" : "left-0",
            panelClassName,
          )}
        >
          {children({ close: () => setOpen(false) })}
        </div>
      ) : null}
    </div>
  );
}

export function DropdownSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="border-b border-line last:border-b-0">
      {title ? <p className="label-micro px-3.5 pb-1.5 pt-3">{title}</p> : null}
      <div className="pb-2">{children}</div>
    </div>
  );
}

export function DropdownItem({
  icon,
  children,
  onSelect,
  tone = "default",
  disabled,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onSelect?: () => void;
  tone?: "default" | "danger" | "muted";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs transition-colors disabled:opacity-50",
        tone === "danger"
          ? "text-red-400 hover:bg-red-500/10"
          : tone === "muted"
            ? "text-faint hover:bg-line/40"
            : "text-muted hover:bg-line/40 hover:text-ink",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}
