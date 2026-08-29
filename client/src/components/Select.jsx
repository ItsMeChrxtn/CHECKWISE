import { forwardRef, useId } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../utils/cn.js";

/**
 * Native select styled to match Input. Native is deliberate: it gives correct
 * keyboard and mobile behaviour for free.
 */
const Select = forwardRef(function Select(
  { label, error, hint, options = [], className, children, ...props },
  ref
) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold text-ink-700">
          {label}
        </label>
      )}

      <div className="relative">
        <select
          id={id}
          ref={ref}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={describedBy}
          className={cn(
            "h-10 w-full appearance-none rounded-sm border bg-white px-3 pr-10 text-sm text-ink-900",
            "transition-colors focus:outline-none focus:ring-[3px]",
            error
              ? "border-fail-300 focus:border-fail-600 focus:ring-fail-100"
              : "border-ink-300 focus:border-brand-600 focus:ring-brand-100"
          )}
          {...props}
        >
          {children ??
            options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
        </select>

        <ChevronDown
          size={17}
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400"
        />
      </div>

      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-fail-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export default Select;
