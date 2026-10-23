import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  block?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand text-[#04140E] font-semibold border border-brand-600/60 hover:bg-brand-400 active:bg-brand-500 shadow-[0_1px_0_rgba(255,255,255,0.15)_inset]",
  secondary:
    "bg-elevated text-ink border border-line hover:border-brand/40 hover:bg-line/40",
  ghost: "bg-transparent text-muted border border-transparent hover:text-ink hover:bg-line/40",
  danger:
    "bg-transparent text-red-400 border border-red-500/35 hover:bg-red-500/10 hover:border-red-500/60",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  block,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={cn(
        "inline-flex items-center justify-center rounded-lg transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45 select-none whitespace-nowrap",
        VARIANTS[variant],
        SIZES[size],
        block && "w-full",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
}

export function IconButton({ label, children, className, ...rest }: IconButtonProps) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-elevated text-muted transition-colors hover:text-ink hover:border-brand/40",
        className,
      )}
    >
      {children}
    </button>
  );
}
