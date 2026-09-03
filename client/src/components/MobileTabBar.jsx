import { NavLink } from "react-router-dom";
import { BarChart3, ClipboardList, LayoutDashboard, Settings, Users } from "lucide-react";

/**
 * The bottom bar a phone expects, matching the Flutter app tab for tab.
 *
 * A drawer behind a hamburger is a desktop pattern that survives being made
 * narrow; it is not what anyone reaches for on a phone, where the thumb sits at
 * the bottom of the screen and the destinations should already be under it.
 * Installed to a home screen there is no browser chrome either, so without this
 * the app would open with its navigation hidden behind a button.
 *
 * The same four or five destinations as the app, in the same order, so someone
 * moving between the two is not learning a second layout. The sidebar keeps the
 * longer list - Create Exam, Answer Sheets, Reports - because a bar of nine
 * tabs is a menu again.
 */
export default function MobileTabBar({ isAdmin }) {
  const tabs = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/exams", label: "Exams", icon: ClipboardList },
    { to: "/results", label: "Results", icon: BarChart3 },
    ...(isAdmin ? [{ to: "/admin/users", label: "Accounts", icon: Users }] : []),
    { to: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <nav
      aria-label="Sections"
      /*
       * pb-[env(safe-area-inset-bottom)] keeps the labels clear of the home
       * indicator on an iPhone, where the page reaches under it because of
       * viewport-fit=cover.
       */
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="flex">
        {tabs.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                [
                  "flex flex-col items-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors",
                  isActive ? "text-brand-700" : "text-ink-500",
                ].join(" ")
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={[
                      "grid h-7 w-12 place-items-center rounded-full transition-colors",
                      isActive ? "bg-brand-50" : "bg-transparent",
                    ].join(" ")}
                  >
                    <Icon size={19} aria-hidden="true" />
                  </span>
                  <span className="truncate">{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
