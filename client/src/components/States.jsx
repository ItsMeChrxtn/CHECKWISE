import { AlertTriangle, Loader2 } from "lucide-react";
import Button from "./Button.jsx";

export function Spinner({ label = "Loading" }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-10 text-ink-500">
      <Loader2 size={20} className="animate-spin" aria-hidden="true" />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {Icon && (
        <span className="mb-3 grid h-11 w-11 place-items-center rounded-sm border border-ink-200 bg-ink-50 text-ink-400">
          <Icon size={22} aria-hidden="true" />
        </span>
      )}
      <p className="text-base font-semibold text-ink-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="mb-3 grid h-11 w-11 place-items-center rounded-sm border border-fail-100 bg-fail-50 text-fail-600">
        <AlertTriangle size={22} aria-hidden="true" />
      </span>
      <p className="text-base font-semibold text-ink-900">Something went wrong</p>
      <p className="mt-1 max-w-sm text-sm text-ink-500">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
