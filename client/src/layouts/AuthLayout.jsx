import { Outlet } from "react-router-dom";
import { Link } from "react-router-dom";
import { CheckCheck, ScanLine, BarChart3 } from "lucide-react";
import Logo from "../components/Logo.jsx";

const HIGHLIGHTS = [
  {
    icon: CheckCheck,
    title: "Answer keys you control",
    body: "Extraction assists; the teacher always confirms the key.",
  },
  {
    icon: ScanLine,
    title: "Scan with any phone",
    body: "Corner markers correct rotation, tilt and perspective.",
  },
  {
    icon: BarChart3,
    title: "Results the moment you scan",
    body: "Scores, pass rates and reports generated automatically.",
  },
];

/**
 * Sign in and register.
 *
 * The side panel used to be a full-height near-black slab, which is a lot of
 * dark to stare into before you have even typed a password. It is paper now,
 * separated by a hairline, with the colour reserved for the mark and the
 * primary button.
 */
export default function AuthLayout() {
  return (
    <div className="flex min-h-screen bg-white">
      <aside className="hidden w-1/2 flex-col justify-between border-r border-ink-200 bg-ink-50 p-10 lg:flex xl:w-[52%]">
        <Link to="/" aria-label="CheckWise home">
          <Logo size="md" />
        </Link>

        <div className="max-w-lg">
          <h2 className="text-[2.6rem] font-semibold leading-[1.1] tracking-[-0.03em] text-ink-900">
            Smart exam checking.
            <span className="block text-brand-600">Accurate results.</span>
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-ink-500">
            CheckWise turns a stack of answer sheets into scored, analysed results — without the
            red pen.
          </p>

          <ul className="mt-10 space-y-6">
            {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-ink-200 bg-white text-brand-600">
                  <Icon size={17} aria-hidden="true" />
                </span>
                <div>
                  <p className="font-semibold text-ink-900">{title}</p>
                  <p className="mt-0.5 text-sm text-ink-500">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-ink-400">
          © {new Date().getFullYear()} CheckWise Smart Exam Checking System
        </p>
      </aside>

      <div className="flex w-full flex-col justify-center px-5 py-10 sm:px-10 lg:w-1/2 xl:w-[48%]">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-9 lg:hidden">
            <Link to="/" aria-label="CheckWise home">
              <Logo size="md" />
            </Link>
          </div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
