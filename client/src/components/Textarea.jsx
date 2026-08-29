import { forwardRef, useId } from "react";
import { cn } from "../utils/cn.js";

const Textarea = forwardRef(function Textarea(
  { label, error, hint, rows = 4, className, ...props },
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

      <textarea
        id={id}
        ref={ref}
        rows={rows}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy}
        className={cn(
          "w-full resize-y rounded-sm border bg-white px-3 py-2.5 text-sm text-ink-900",
          "transition-colors placeholder:text-ink-400 focus:outline-none focus:ring-[3px]",
          error
            ? "border-fail-300 focus:border-fail-600 focus:ring-fail-100"
            : "border-ink-300 focus:border-brand-600 focus:ring-brand-100"
        )}
        {...props}
      />

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

export default Textarea;
