import { Link } from "react-router-dom";
import { ArrowLeft, Hammer } from "lucide-react";
import Button from "../components/Button.jsx";

/**
 * Honest destination for navigation items whose feature lands in a later phase.
 * Every sidebar link therefore leads somewhere real and explains itself, rather
 * than 404-ing or silently doing nothing.
 */
export default function PhasePlaceholder({ title, phase, description, bullets = [] }) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="card p-8 text-center">
        <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-sm border border-brand-100 bg-brand-50 text-brand-700">
          <Hammer size={24} aria-hidden="true" />
        </span>

        <span className="inline-block rounded-sm bg-ink-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-ink-600">
          {typeof phase === "number" ? "Phase " + phase : phase}
        </span>

        <h2 className="mt-3 text-xl font-bold tracking-tight text-ink-900">{title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">{description}</p>

        {bullets.length > 0 && (
          <ul className="mx-auto mt-6 max-w-sm space-y-2 text-left">
            {bullets.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-ink-600">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500"
                  aria-hidden="true"
                />
                {item}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-7">
          <Link to="/dashboard">
            <Button variant="secondary">
              <ArrowLeft size={16} aria-hidden="true" />
              Back to dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
