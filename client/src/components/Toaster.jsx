import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useToast } from "../hooks/useToast.js";

const STYLES = {
  success: { icon: CheckCircle2, ring: "border-pass-100", tint: "text-pass-600" },
  error: { icon: AlertCircle, ring: "border-fail-100", tint: "text-fail-600" },
  info: { icon: Info, ring: "border-brand-200", tint: "text-brand-600" },
};

export default function Toaster() {
  const { toasts, dismiss } = useToast();

  if (!toasts.length) return null;

  return (
    // Bottom-anchored on mobile; on larger screens sm:top-20 clears the 4rem
    // topbar so a toast never covers the user menu.
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col gap-2 sm:inset-x-auto sm:right-6 sm:top-20 sm:bottom-auto sm:w-96"
    >
      {toasts.map(({ id, type, message }) => {
        const { icon: Icon, ring, tint } = STYLES[type] || STYLES.info;

        return (
          <div
            key={id}
            role="alert"
            className={`pointer-events-auto flex items-start gap-3 rounded-lg border bg-white p-3.5 shadow-lg ${ring}`}
          >
            <Icon size={19} className={`mt-0.5 shrink-0 ${tint}`} aria-hidden="true" />
            <p className="flex-1 text-sm text-ink-700">{message}</p>
            <button
              type="button"
              onClick={() => dismiss(id)}
              aria-label="Dismiss notification"
              className="shrink-0 rounded p-0.5 text-ink-400 hover:text-ink-600"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
