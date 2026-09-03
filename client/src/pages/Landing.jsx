import { useEffect, useState } from "react";
import InstallHint from "../components/InstallHint.jsx";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  CheckCheck,
  ClipboardList,
  FileCheck2,
  Layers,
  PenLine,
  Printer,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Download,
  Menu,
  X,
} from "lucide-react";
import Logo from "../components/Logo.jsx";
import { useAuth } from "../hooks/useAuth.js";

/**
 * The public front door.
 *
 * Written for the person who has a stack of papers on their desk tonight, so
 * it leads with the work rather than the technology: what CheckWise does to a
 * pile of answer sheets, in the order a teacher actually meets it.
 *
 * The claims here are deliberately the ones the system can keep — the teacher
 * confirms every key, the scanner refuses to guess, nothing scores itself
 * behind your back.
 */

/** The four steps, in the order the workflow runs. */
const STEPS = [
  {
    icon: ClipboardList,
    title: "Write the exam",
    body: "Create the exam and upload the finished questionnaire as a PDF. CheckWise reads it and pulls out the questions and the answer key.",
  },
  {
    icon: FileCheck2,
    title: "Confirm the key",
    body: "Review what was read, correct anything the parser misjudged, then confirm. Nothing is graded against a key you have not signed off.",
  },
  {
    icon: Printer,
    title: "Print the sheet",
    body: "CheckWise builds an answer sheet from the confirmed key — bubbles for the marked items, ruled lines for the written ones, corner markers for the scanner.",
  },
  {
    icon: ScanLine,
    title: "Scan the papers",
    body: "Photograph each completed sheet with any phone. Scores, tallies and pass rates are ready the moment the page is read.",
  },
];

/** The six question types the grader understands. */
const QUESTION_TYPES = [
  { name: "Multiple Choice", detail: "Bubbled A–E, read by mark darkness" },
  { name: "True or False", detail: "Bubbled, two options" },
  { name: "Modified True or False", detail: "Truth value plus a written correction" },
  { name: "Identification", detail: "Handwritten, several accepted spellings" },
  { name: "Fill in the Blanks", detail: "Handwritten, matched against the key" },
  { name: "Enumeration", detail: "Handwritten list, one mark per correct item" },
];

const PRINCIPLES = [
  {
    icon: ShieldCheck,
    title: "The teacher owns the key",
    body: "Extraction assists; it never decides. An exam cannot be graded until you have confirmed its answer key yourself.",
  },
  {
    icon: PenLine,
    title: "It refuses to guess",
    body: "A mark the scanner cannot read is flagged, not invented. Nothing unclear earns points until a person settles it.",
  },
  {
    icon: Layers,
    title: "The score follows the paper",
    body: "Every correction re-grades the whole paper on the server, so a mark can never drift from the answers behind it.",
  },
  {
    icon: BarChart3,
    title: "Results you can act on",
    body: "Pass rates, score distribution and per-exam averages, built from the papers as they are checked.",
  },
];

/**
 * The published Android build.
 *
 * The APK is a GitHub release asset rather than a file in `client/public/`.
 * At 55MB it was being committed on every build, and a binary that large in
 * the history slows every clone the deploy makes for the rest of the repo's
 * life. A release holds it once, outside git, and serves it with the right
 * content type already set.
 *
 * These strings describe that asset. Update them together with the release;
 * there is no build step wiring them up.
 */
const ANDROID_BUILD = {
  file: "https://github.com/ItsMeChrxtn/CHECKWISE/releases/latest/download/checkwise.apk",
  version: "0.2.2",
  size: "56.3 MB",
  minAndroid: "10",
};

export default function Landing() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader isAuthenticated={isAuthenticated} />
      <Hero isAuthenticated={isAuthenticated} />
      <Steps />
      <Principles />
      <QuestionTypes />
      <MobileApp />
      <ClosingCta isAuthenticated={isAuthenticated} />
      <SiteFooter />
      <InstallHint />
    </div>
  );
}

/** The in-page sections the header links to. */
const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#what-it-grades", label: "What it grades" },
  { href: "#mobile-app", label: "Get the app" },
];

/**
 * The public header.
 *
 * Below `sm` the section links used to be simply `hidden`, with nothing put in
 * their place — so on a phone there was no way to reach any of them, including
 * the app download. They collapse into a menu now instead of disappearing.
 */
function SiteHeader({ isAuthenticated }) {
  const [open, setOpen] = useState(false);

  // Escape closes it, and the page behind it should not scroll while it is up.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link to="/" aria-label="CheckWise home" onClick={close}>
          <Logo size="sm" />
        </Link>

        {/* Full-width nav, from sm up. */}
        <nav className="hidden items-center gap-6 sm:flex">
          {NAV_LINKS.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="text-sm font-medium text-ink-600 hover:text-brand-700"
            >
              {label}
            </a>
          ))}
          {isAuthenticated ? (
            <Link
              to="/dashboard"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
            >
              Go to dashboard
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          ) : (
            <>
              <Link to="/login" className="text-sm font-semibold text-ink-700 hover:text-brand-700">
                Sign in
              </Link>
              <Link
                to="/register"
                className="inline-flex h-9 items-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
              >
                Create account
              </Link>
            </>
          )}
        </nav>

        {/* Below sm the whole nav lives behind this one control. */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="site-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          className="-mr-2 grid h-10 w-10 place-items-center rounded-lg text-ink-700 hover:bg-ink-100 sm:hidden"
        >
          {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
      </div>

      {open && (
        <div id="site-menu" className="border-t border-ink-200 bg-white sm:hidden">
          <nav className="mx-auto max-w-6xl px-5 py-3">
            <ul className="ruled">
              {NAV_LINKS.map(({ href, label }) => (
                <li key={href}>
                  <a
                    href={href}
                    onClick={close}
                    className="block py-3 text-[15px] font-medium text-ink-700"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex flex-col gap-2.5 pb-2">
              {isAuthenticated ? (
                <Link
                  to="/dashboard"
                  onClick={close}
                  className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white"
                >
                  Go to dashboard
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              ) : (
                <>
                  <Link
                    to="/register"
                    onClick={close}
                    className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white"
                  >
                    Create account
                  </Link>
                  <Link
                    to="/login"
                    onClick={close}
                    className="inline-flex h-11 items-center justify-center rounded-lg border border-ink-300 px-4 text-sm font-semibold text-ink-700"
                  >
                    Sign in
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

function Hero({ isAuthenticated }) {
  return (
    <section className="border-b border-ink-200 bg-ink-50">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <p className="text-sm font-medium text-brand-600">Smart Exam Checking System</p>

          <h1 className="mt-5 text-[2.75rem] font-semibold leading-[1.06] tracking-[-0.035em] text-ink-900 sm:text-[3.5rem]">
            A stack of answer sheets,
            <span className="block text-brand-600">checked before you finish your coffee.</span>
          </h1>

          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-500">
            CheckWise reads your exam, builds the answer sheet, and scores every paper you
            photograph — bubbled items and handwriting alike. You confirm the key; it does the
            counting.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              to={isAuthenticated ? "/dashboard" : "/register"}
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700"
            >
              {isAuthenticated ? "Go to your dashboard" : "Create a teacher account"}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            {!isAuthenticated && (
              <Link
                to="/login"
                className="inline-flex h-12 items-center rounded-lg border border-ink-300 px-6 text-sm font-semibold text-ink-700 hover:bg-white"
              >
                Sign in
              </Link>
            )}
          </div>

          <p className="mt-6 text-xs text-ink-400">
            Six question types · Handwriting and bubbles · Scan with any phone
          </p>
        </div>

        <PaperPreview />
      </div>
    </section>
  );
}

/**
 * A miniature of a checked paper.
 *
 * Deliberately a real artefact rather than a stock illustration: it shows the
 * three outcomes the product is actually about — a correct mark, a wrong one,
 * and a written answer the scanner has flagged for a person.
 */
function PaperPreview() {
  const rows = [
    { n: 1, given: "D", key: "D", state: "correct" },
    { n: 2, given: "B", key: "B", state: "correct" },
    { n: 3, given: "A", key: "B", state: "wrong" },
    { n: 4, given: "TRUE", key: "TRUE", state: "correct" },
    { n: 6, given: "ReactJS", key: "ReactJS", state: "correct" },
    { n: 7, given: "useEffct", key: "useEffect", state: "review" },
  ];

  const TONE = {
    correct: { dot: "bg-pass-600", text: "text-pass-700", label: "Correct" },
    wrong: { dot: "bg-fail-600", text: "text-fail-700", label: "Wrong" },
    review: { dot: "bg-warn-600", text: "text-warn-700", label: "Needs review" },
  };

  return (
    <div className="overlay rounded-xl border border-ink-200 bg-white">
      <div className="flex items-center justify-between border-b border-ink-200 px-5 py-3.5">
        <div>
          <p className="eyebrow">Paper</p>
          <p className="mt-1 text-base font-semibold text-ink-900">M. Santos</p>
        </div>
        <div className="text-right">
          <p className="figure text-3xl leading-none text-pass-700">86%</p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-pass-700">
            Passed
          </p>
        </div>
      </div>

      <ul className="ruled px-5">
        {rows.map(({ n, given, key, state }) => {
          const tone = TONE[state];
          return (
            <li key={n} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="w-5 shrink-0 text-right text-xs font-semibold text-ink-400">
                {n}
              </span>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
              <span className="w-24 shrink-0 truncate font-medium text-ink-900">{given}</span>
              <span className="hidden flex-1 truncate text-xs text-ink-500 sm:block">
                key: {key}
              </span>
              <span className={`shrink-0 text-[11px] font-semibold ${tone.text}`}>{tone.label}</span>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-ink-200 bg-ink-50 px-5 py-3">
        <p className="text-xs text-ink-500">
          One item flagged — the scanner will not score what it cannot read.
        </p>
      </div>
    </div>
  );
}

function Steps() {
  return (
    <section id="how-it-works" className="border-b border-ink-200 bg-white">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <SectionIntro
          eyebrow="How it works"
          title="Four steps, once per exam"
          body="Set an exam up on the web app, then scan its papers from anywhere — the phone app carries the camera half."
        />

        <ol className="mt-12 grid gap-px overflow-hidden rounded-lg border border-ink-200 bg-ink-200 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ icon: Icon, title, body }, index) => (
            <li key={title} className="bg-white p-6">
              <div className="flex items-center gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand-50 text-[13px] font-semibold text-brand-700">
                  {index + 1}
                </span>
                <Icon size={16} className="text-ink-300" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-ink-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Principles() {
  return (
    <section className="border-b border-ink-200 bg-ink-50">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <SectionIntro
          eyebrow="Why teachers trust it"
          title="It marks the paper. You keep the judgement."
          body="Automatic grading is only worth having if it cannot quietly get a student's mark wrong. CheckWise is built around that."
        />

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {PRINCIPLES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="card p-6">
              <Icon size={19} className="text-brand-600" aria-hidden="true" />
              <h3 className="mt-4 text-base font-semibold text-ink-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function QuestionTypes() {
  return (
    <section id="what-it-grades" className="border-b border-ink-200 bg-white">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <SectionIntro
            eyebrow="What it grades"
            title="Six question types, bubbles and handwriting"
            body="Written answers are read off the ruled lines and matched against the key. Enumeration earns a mark per correct item, and Modified True or False can score the truth value and the correction separately."
            align="left"
          />

          <div className="overflow-hidden rounded-lg border border-ink-200">
            <ul className="ruled">
              {QUESTION_TYPES.map(({ name, detail }) => (
                <li
                  key={name}
                  className="flex items-baseline justify-between gap-4 bg-white px-5 py-4"
                >
                  <span className="text-[15px] font-medium text-ink-900">{name}</span>
                  <span className="text-right text-xs text-ink-500">{detail}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function MobileApp() {
  return (
    <section id="mobile-app" className="border-b border-ink-200 bg-ink-50">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="card overflow-hidden">
          <div className="grid gap-10 p-8 sm:p-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <div className="flex items-center gap-2 text-brand-600">
                <Smartphone size={17} aria-hidden="true" />
                <span className="text-sm font-medium">CheckWise for Android</span>
              </div>

              <h2 className="mt-4 text-[1.75rem] font-semibold tracking-[-0.03em] text-ink-900 sm:text-3xl">
                The scanner lives in your pocket
              </h2>

              <p className="mt-4 max-w-lg leading-relaxed text-ink-500">
                Set the exam up here, then photograph the finished papers with your phone. The app
                signs in to this same account and scores each sheet against the key you confirmed.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                {/*
                  A plain link, not a router Link: this leaves the SPA for
                  GitHub, and the router would otherwise swallow it and render
                  the not-found page.

                  No `download` attribute: the file is on another origin, where
                  the attribute is ignored anyway, and GitHub already sends it
                  as an attachment.
                */}
                <a
                  href={ANDROID_BUILD.file}
                  rel="noopener"
                  className="inline-flex h-12 items-center gap-2.5 rounded-lg bg-brand-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
                >
                  <Download size={17} aria-hidden="true" />
                  Download the app
                </a>

                <p className="text-xs leading-relaxed text-ink-400">
                  Version {ANDROID_BUILD.version} · {ANDROID_BUILD.size}
                  <br />
                  Android {ANDROID_BUILD.minAndroid} and later
                </p>
              </div>

              {/* Sideloading always trips people up on the first try, so the two
                  things that will happen are said before they happen. */}
              <div className="mt-8 rounded-lg border border-ink-200 bg-ink-50 p-4">
                <p className="text-[13px] font-medium text-ink-700">Installing it</p>
                <ol className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-ink-500">
                  <li>
                    1. Android will ask you to allow installs from your browser — this app is not on
                    the Play Store.
                  </li>
                  <li>
                    2. Open the app and set your CheckWise server address under{" "}
                    <span className="font-medium text-ink-700">Settings → CheckWise server</span>.
                  </li>
                </ol>
              </div>
            </div>

            <PhonePreview />
          </div>
        </div>
      </div>
    </section>
  );
}

/** A phone showing the scanner's framing guide over a sheet. */
function PhonePreview() {
  return (
    <div className="mx-auto w-full max-w-[240px]">
      <div className="rounded-[28px] border border-ink-300 bg-white p-2.5 shadow-sm">
        <div className="relative aspect-[9/19] overflow-hidden rounded-[20px] bg-ink-900">
          {/*
            The four corner brackets the real viewfinder draws. They stop short
            of the bottom so the shutter and the hint have their own band —
            spanning the full height put the lower two behind the controls.
          */}
          <div className="absolute inset-x-5 top-8 bottom-28">
            {[
              "left-0 top-0 border-l-2 border-t-2 rounded-tl-md",
              "right-0 top-0 border-r-2 border-t-2 rounded-tr-md",
              "left-0 bottom-0 border-l-2 border-b-2 rounded-bl-md",
              "right-0 bottom-0 border-r-2 border-b-2 rounded-br-md",
            ].map((pos) => (
              <span
                key={pos}
                aria-hidden="true"
                className={`absolute h-6 w-6 border-white/85 ${pos}`}
              />
            ))}
          </div>

          <div className="absolute inset-x-0 bottom-[4.75rem] flex justify-center px-3">
            <span className="rounded-full bg-black/60 px-2.5 py-1 text-[9.5px] font-medium text-white">
              Fill the frame with the sheet
            </span>
          </div>

          <div className="absolute inset-x-0 bottom-5 flex justify-center">
            <span className="h-10 w-10 rounded-full border-[3px] border-white bg-white/90" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ClosingCta({ isAuthenticated }) {
  return (
    <section className="border-b border-ink-200 bg-ink-50">
      <div className="mx-auto max-w-3xl px-5 py-16 text-center sm:px-8 sm:py-20">
        <h2 className="text-3xl font-semibold tracking-[-0.03em] text-ink-900 sm:text-4xl">
          Put the red pen down.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-ink-500">
          Set up your first exam tonight and scan the papers tomorrow morning.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            to={isAuthenticated ? "/dashboard" : "/register"}
            className="inline-flex h-12 items-center gap-2 rounded-lg bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700"
          >
            {isAuthenticated ? "Go to your dashboard" : "Create a teacher account"}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          {!isAuthenticated && (
            <Link
              to="/login"
              className="inline-flex h-12 items-center rounded-lg border border-ink-300 px-6 text-sm font-semibold text-ink-700 hover:bg-white"
            >
              I already have an account
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-ink-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row sm:px-8">
        <Logo size="sm" />
        <p className="flex items-center gap-2 text-xs text-ink-400">
          <CheckCheck size={13} aria-hidden="true" />© {new Date().getFullYear()} CheckWise Smart
          Exam Checking System
        </p>
      </div>
    </footer>
  );
}

function SectionIntro({ eyebrow, title, body, align = "center" }) {
  const centred = align === "center";

  return (
    <div className={centred ? "mx-auto max-w-2xl text-center" : "max-w-xl"}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="text-[1.75rem] font-semibold tracking-[-0.03em] text-ink-900 sm:text-3xl">{title}</h2>
      <p className="mt-4 leading-relaxed text-ink-500">{body}</p>
    </div>
  );
}
