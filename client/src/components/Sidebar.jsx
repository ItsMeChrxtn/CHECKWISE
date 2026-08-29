import { Link, useLocation } from "react-router-dom";
import {
  BarChart3,
  FileSpreadsheet,
  FilePlus2,
  LayoutDashboard,
  ScanLine,
  Settings,
  ShieldCheck,
  ClipboardList,
  Users,
  X,
} from "lucide-react";
import Logo from "./Logo.jsx";
import { cn } from "../utils/cn.js";

/**
 * `phase` marks features that arrive in a later build phase. Those links still
 * navigate to a real route that explains what is coming - never a dead link.
 *
 * `match` overrides the default "active on this path or any child" rule. Exams
 * needs it so that /exams/new highlights Create Exam alone rather than lighting
 * up both entries.
 */
const EXAMS_MATCH = (pathname) =>
  pathname === "/exams" || (pathname.startsWith("/exams/") && pathname !== "/exams/new");

/**
 * Grouped rather than a flat run of nine links: the sections name the stages of
 * the teacher's actual workflow, so the sidebar reads as a table of contents
 * for the process instead of an undifferentiated list.
 */
const TEACHER_NAV = [
  {
    section: null,
    items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    section: "Examinations",
    items: [
      { to: "/exams", label: "Exams", icon: ClipboardList, match: EXAMS_MATCH },
      { to: "/exams/new", label: "Create Exam", icon: FilePlus2 },
      { to: "/answer-sheets", label: "Answer Sheets", icon: FileSpreadsheet, phase: 5 },
    ],
  },
  {
    section: "Checking",
    items: [
      { to: "/scanner", label: "OMR Scanner", icon: ScanLine, phase: 6 },
      { to: "/results", label: "Results", icon: BarChart3, phase: 7 },
      { to: "/reports", label: "Reports", icon: BarChart3, phase: 8 },
    ],
  },
  {
    section: "Account",
    items: [{ to: "/settings", label: "Settings", icon: Settings }],
  },
];

const ADMIN_NAV = [
  {
    section: null,
    items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    section: "Administration",
    items: [{ to: "/admin/users", label: "Users", icon: Users }],
  },
  {
    section: "Examinations",
    items: [
      { to: "/exams", label: "All Exams", icon: ClipboardList, match: EXAMS_MATCH },
      { to: "/results", label: "All Results", icon: BarChart3, phase: 7 },
    ],
  },
  {
    section: "Account",
    items: [{ to: "/settings", label: "Settings", icon: Settings }],
  },
];

function isItemActive(pathname, item) {
  if (item.match) return item.match(pathname);
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export default function Sidebar({ open, onClose, isAdmin }) {
  const groups = isAdmin ? ADMIN_NAV : TEACHER_NAV;
  const { pathname } = useLocation();

  return (
    <>
      {/* Mobile scrim */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-ink-900/25 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-ink-200 bg-ink-50 transition-transform duration-200",
          "lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-ink-200 px-5">
          <Logo size="sm" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded-md p-1 text-ink-400 hover:bg-ink-200 hover:text-ink-700 lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
          {groups.map((group, index) => (
            <div key={group.section ?? "root"} className={cn(index > 0 && "mt-6")}>
              {group.section && (
                <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{group.section}</p>
              )}

              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const { to, label, icon: Icon, phase } = item;
                  const active = isItemActive(pathname, item);

                  return (
                    <Link
                      key={to}
                      to={to}
                      onClick={onClose}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-md py-2 pl-3 pr-3 text-sm transition-colors",
                        active
                          ? "bg-brand-50 font-semibold text-brand-700"
                          : "font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900"
                      )}
                    >
                      {/* Brass edge marks the current page — an accent rule
                          rather than a filled block, so the nav stays quiet. */}
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute inset-y-1.5 left-0 w-[3px] rounded-r-full",
                          active ? "bg-brand-500" : "bg-transparent"
                        )}
                      />
                      <Icon
                        size={17}
                        aria-hidden="true"
                        className={cn("shrink-0", active ? "text-brand-600" : "text-ink-400")}
                      />
                      <span className="flex-1 truncate">{label}</span>
                      {phase && (
                        <span
                          title={`Arriving in Phase ${phase}`}
                          className="rounded border border-ink-200 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-ink-400"
                        >
                          P{phase}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-ink-200 px-5 py-4">
          <div className="flex items-center gap-2 text-xs font-medium text-ink-400">
            <ShieldCheck size={13} aria-hidden="true" />
            <span>{isAdmin ? "Administrator" : "Teacher workspace"}</span>
          </div>
        </div>
      </aside>
    </>
  );
}
