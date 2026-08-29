import { Mail, ShieldCheck, User as UserIcon, CalendarClock } from "lucide-react";
import { useAuth } from "../hooks/useAuth.js";
import { formatDateTime } from "../utils/format.js";
import { initials } from "../utils/format.js";

/**
 * Read-only account overview for Phase 1. Editing a profile and changing a
 * password are account-management features scheduled with user management.
 */
export default function Settings() {
  const { user } = useAuth();

  const rows = [
    { icon: UserIcon, label: "Full name", value: user.name },
    { icon: Mail, label: "Email address", value: user.email },
    { icon: ShieldCheck, label: "Role", value: user.role, capitalize: true },
    { icon: CalendarClock, label: "Account created", value: formatDateTime(user.createdAt) },
    { icon: CalendarClock, label: "Last sign in", value: formatDateTime(user.lastLoginAt) },
  ];

  return (
    <div className="max-w-2xl space-y-6">
      <section className="card p-5">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-sm bg-brand-700 text-xl font-semibold text-white">
            {initials(user.name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-ink-900">{user.name}</p>
            <p className="truncate text-sm text-ink-500">{user.email}</p>
          </div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <h2 className="border-b border-ink-200 px-5 py-3.5 text-sm font-semibold text-ink-800">
          Account details
        </h2>

        <dl className="divide-y divide-ink-100">
          {rows.map(({ icon: Icon, label, value, capitalize }) => (
            <div key={label} className="flex items-center gap-3 px-5 py-3.5">
              <Icon size={17} className="shrink-0 text-ink-400" aria-hidden="true" />
              <dt className="w-40 shrink-0 text-sm text-ink-500">{label}</dt>
              <dd
                className={`min-w-0 flex-1 truncate text-sm font-medium text-ink-800 ${
                  capitalize ? "capitalize" : ""
                }`}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="text-sm text-ink-500">
        Profile editing and password changes arrive alongside user management.
      </p>
    </div>
  );
}
