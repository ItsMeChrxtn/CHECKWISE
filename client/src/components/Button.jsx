import { Loader2 } from "lucide-react";
import { cn } from "../utils/cn.js";

const VARIANTS = {
  primary: "bg-brand-700 text-white hover:bg-brand-800 disabled:hover:bg-brand-700",
  secondary: "bg-white text-ink-700 border border-ink-300 hover:border-ink-400 hover:bg-ink-50",
  ghost: "text-ink-600 hover:bg-ink-100",
  danger: "bg-fail-600 text-white hover:bg-fail-700",
  /* The one brass action per screen, where a step has to be signed off. */
  accent: "bg-accent-600 text-white hover:bg-accent-700",
};

const SIZES = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-6 text-[15px] gap-2",
};

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  className,
  children,
  type = "button",
  ...props
}) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-sm font-semibold transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-55",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    >
      {loading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
