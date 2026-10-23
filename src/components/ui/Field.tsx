import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const base =
  "h-9 w-full rounded-lg border border-line bg-elevated px-3 text-sm text-ink transition-colors placeholder:text-faint hover:border-brand/30 focus:border-brand/60";

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select
      {...rest}
      className={cn(
        base,
        "cursor-pointer appearance-none bg-[length:14px] bg-[right_0.6rem_center] bg-no-repeat pr-9",
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236C7D76' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
      }}
    >
      {children}
    </select>
  );
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cn(base, className)} />;
}

export function NumberInput({
  className,
  suffix,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { suffix?: string }) {
  return (
    <div className="relative">
      <input
        {...rest}
        type="number"
        className={cn(base, "num pr-14", className)}
      />
      {suffix ? (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-2xs text-faint">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

export function FieldRow({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-line py-3.5 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="sm:max-w-[58%]">
        <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
          {label}
        </label>
        {hint ? <p className="mt-0.5 text-xs leading-relaxed text-faint">{hint}</p> : null}
      </div>
      <div className="sm:w-[220px] sm:shrink-0">{children}</div>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
        checked ? "border-brand/50 bg-brand/25" : "border-line bg-elevated",
      )}
    >
      <span
        className={cn(
          "ml-0.5 inline-block h-4 w-4 rounded-full transition-transform duration-200",
          checked ? "translate-x-5 bg-brand" : "translate-x-0 bg-faint",
        )}
      />
    </button>
  );
}

export function SegmentedControl<T extends string | number>({
  value,
  options,
  onChange,
  size = "md",
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: string; title?: string }>;
  onChange: (next: T) => void;
  size?: "sm" | "md";
  /** Names the group for assistive technology when no visible label is associated. */
  ariaLabel?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex rounded-lg border border-line bg-elevated p-0.5"
    >
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          title={option.title}
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cn(
            "rounded-md font-medium transition-colors",
            size === "sm" ? "px-2.5 py-1 text-2xs" : "px-3 py-1.5 text-xs",
            value === option.value
              ? "bg-brand/15 text-brand-300"
              : "text-muted hover:text-ink",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
