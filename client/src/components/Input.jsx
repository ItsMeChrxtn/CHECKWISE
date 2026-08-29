import { forwardRef, useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "../utils/cn.js";

/**
 * Label + control + error message. Wires aria-invalid / aria-describedby so
 * screen readers announce validation failures.
 */
const Input = forwardRef(function Input(
  { label, error, type = "text", hint, className, ...props },
  ref
) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";
  const resolvedType = isPassword && revealed ? "text" : type;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold text-ink-700">
          {label}
        </label>
      )}

      <div className="relative">
        <input
          id={id}
          ref={ref}
          type={resolvedType}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={describedBy}
          className={cn(
            "h-10 w-full rounded-sm border bg-white px-3 text-sm text-ink-900 transition-colors",
            "placeholder:text-ink-400 focus:outline-none focus:ring-[3px]",
            isPassword && "pr-11",
            error
              ? "border-fail-300 focus:border-fail-600 focus:ring-fail-100"
              : "border-ink-300 focus:border-brand-600 focus:ring-brand-100"
          )}
          {...props}
        />

        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? "Hide password" : "Show password"}
            className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-ink-400 hover:text-ink-600"
          >
            {revealed ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        )}
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

export default Input;
