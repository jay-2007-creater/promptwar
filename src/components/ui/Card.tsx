import { useState, type ReactNode } from "react";
import { ChevronDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
  as: Tag = "section",
}: {
  className?: string;
  children: ReactNode;
  as?: "section" | "article" | "div" | "aside";
}) {
  return <Tag className={cn("card", className)}>{children}</Tag>;
}

export function CardHeader({
  title,
  caption,
  icon,
  actions,
  className,
}: {
  title: string;
  caption?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex items-start justify-between gap-4 border-b border-line px-4 py-3 md:px-5",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {icon ? <span className="mt-0.5 text-brand">{icon}</span> : null}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-ink">{title}</h3>
          {caption ? (
            <p className="mt-0.5 text-xs leading-relaxed text-faint">{caption}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow ? <p className="label-micro mb-1.5">{eyebrow}</p> : null}
        <h2 className="text-lg font-semibold text-ink md:text-xl">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Explainability disclosure — shows exactly how a surfaced number was produced. */
export function MethodNote({
  label = "How is this computed?",
  children,
  className,
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("text-xs", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-faint transition-colors hover:text-muted"
      >
        <Info size={12} />
        {label}
        <ChevronDown
          size={12}
          className={cn("transition-transform duration-200", open && "rotate-180")}
        />
      </button>
      {open ? (
        <p className="mt-2 animate-fade-in rounded-lg border border-line bg-elevated/60 p-2.5 leading-relaxed text-muted">
          {children}
        </p>
      ) : null}
    </div>
  );
}

export function KbdRow({ items }: { items: Array<{ k: string; v: string }> }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.k} className="flex items-baseline justify-between gap-4 text-xs">
          <dt className="text-faint">{item.k}</dt>
          <dd className="text-right font-medium text-muted">{item.v}</dd>
        </div>
      ))}
    </dl>
  );
}
