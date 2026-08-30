import { useState } from "react";
import { ChevronDown, ListChecks } from "lucide-react";
import { FORMAT_SAMPLES } from "../config/formatSamples.js";

/**
 * How an exam PDF has to be written for CheckWise to read it.
 *
 * Every rule is taken from server/services/answerKeyParser.js — the section
 * heading pattern, the accepted answer markers, the TRUE/FALSE words. If the
 * parser changes, this changes with it: guidance that drifts from the code is
 * worse than none, because a teacher follows it and still gets warnings they
 * cannot explain.
 *
 * The same rules apply whatever the paper is. A ten-item quiz and an
 * eighty-item final go through the same parser; length changes nothing.
 *
 * Mirrors mobile/lib/screens/format_guide.dart.
 */
const RULES = [
  {
    title: "Number every item",
    body: "Each question must start with its number. Any of these work:",
    examples: ["1. What is JSX?", "2) What is JSX?", "3] What is JSX?"],
    note: "Numbering may restart in each section — that is expected.",
  },
  {
    title: "Head each section, and name its type",
    body:
      "CheckWise picks the question type out of the heading, so write the type in it. " +
      "TEST, PART or SECTION all work, as do plain roman numerals:",
    examples: ["TEST I: MULTIPLE CHOICE", "PART 2 - TRUE OR FALSE", "III. IDENTIFICATION"],
    note:
      "Recognised types: Multiple Choice · True or False · Modified True or False · " +
      "Identification · Fill in the Blanks (or Complete the Program) · Enumeration.",
  },
  {
    title: "Letter your choices",
    body: "For multiple choice, label the options A through H:",
    examples: ["A. Mounting", "B) Updating", "C] Unmounting"],
  },
  {
    title: "Mark the correct answer",
    body: "This is the part that matters most. Any one of these is enough:",
    examples: [
      "Highlight it — the usual way",
      "ANSWER: B      (or ANS, KEY, SAGOT)",
      "TRUE 1. React uses a virtual DOM.",
      "An ANSWER KEY block at the end",
    ],
    note:
      "An item with no answer is not guessed at. It comes back as a warning and you set " +
      "it on the review screen.",
  },
  {
    title: "True or False wording",
    body: "Any of these are understood, in English or Filipino:",
    examples: ["TRUE · T · TAMA · WASTO", "FALSE · F · MALI"],
    note:
      "For Modified True or False, a FALSE item also needs the correcting word, or it is " +
      "flagged.",
  },
  {
    title: "Accepting more than one spelling",
    body:
      "For written answers, give the variations you will accept — any one of them earns " +
      "the mark:",
    examples: ["ReactJS / React", "ReactJS (React)", "ReactJS or React"],
  },
  {
    title: "Mixing types in one section",
    body:
      "The heading is a starting point, not a rule. An item that carries lettered options is " +
      "read as multiple choice, and one answered TRUE or FALSE is read as such, wherever they " +
      "sit — so a section can hold a mix:",
    examples: [
      "GENERAL QUIZ",
      "",
      "1. Which hook manages local state?",
      "   A. useEffect      C. useMemo",
      "   B. useState       D. useRef",
      "   ANSWER: B",
      "",
      "2. React keeps a virtual DOM in memory.",
      "   ANSWER: TRUE",
      "",
      "3. JSX is compiled by Webpack.",
      "   ANSWER: FALSE - Babel",
    ],
    note:
      "Enumeration is the one type that still needs its section named — a comma-separated " +
      "answer is not enough on its own to tell it apart from an identification. Every item's " +
      "type is shown on the review screen, and you can change any of them there.",
  },
  {
    title: "Setting the marks per item",
    body: "Put the count and the points in the section heading:",
    examples: ["TEST I: MULTIPLE CHOICE (40 items, 1 point each)"],
    note: "Left out, every item in the section is worth 1 point.",
  },
];

export default function FormatGuide({ defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [sampleType, setSampleType] = useState(FORMAT_SAMPLES[0].type);

  const sample = FORMAT_SAMPLES.find((s) => s.type === sampleType) ?? FORMAT_SAMPLES[0];

  return (
    <section className="rounded-lg border border-ink-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <ListChecks size={18} className="shrink-0 text-brand-600" aria-hidden="true" />
        <span className="flex-1">
          <span className="block text-sm font-semibold text-ink-900">
            How to write your exam PDF
          </span>
          <span className="block text-xs text-ink-500">
            Eight rules and a worked sample of every question type. Same for a short quiz or a
            long final.
          </span>
        </span>
        <ChevronDown
          size={18}
          aria-hidden="true"
          className={`shrink-0 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <ol className="ruled border-t border-ink-200">
          {RULES.map((rule, index) => (
            <li key={rule.title} className="flex gap-3 px-4 py-4">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-900">{rule.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-600">{rule.body}</p>

                {rule.examples && (
                  <pre className="mt-2 overflow-x-auto rounded-md border border-ink-200 bg-ink-50 px-3 py-2 font-mono text-xs leading-relaxed text-ink-800">
                    {rule.examples.join("\n")}
                  </pre>
                )}

                {rule.note && <p className="mt-2 text-xs leading-relaxed text-ink-500">{rule.note}</p>}
              </div>
            </li>
          ))}

          <li className="px-4 py-4">
            <p className="text-sm font-semibold text-ink-900">A sample of each type</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-600">
              Whole sections, written the way CheckWise reads them. Pick the type you are
              setting.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {FORMAT_SAMPLES.map((entry) => {
                const selected = entry.type === sampleType;
                return (
                  <button
                    key={entry.type}
                    type="button"
                    onClick={() => setSampleType(entry.type)}
                    aria-pressed={selected}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      selected
                        ? "border-brand-300 bg-brand-50 text-brand-700"
                        : "border-ink-200 bg-white text-ink-600 hover:border-ink-300"
                    }`}
                  >
                    {entry.label}
                  </button>
                );
              })}
            </div>

            <p className="mt-3 text-xs leading-relaxed text-ink-500">{sample.blurb}</p>

            <pre className="mt-2 overflow-x-auto rounded-md border border-ink-200 bg-ink-50 px-3 py-3 font-mono text-xs leading-relaxed text-ink-800">
              {sample.sample}
            </pre>

            <ul className="mt-3 space-y-1.5">
              {sample.notes.map((note) => (
                <li key={note} className="flex gap-2 text-xs leading-relaxed text-ink-500">
                  <span aria-hidden="true" className="text-ink-300">·</span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </li>

          <li className="bg-ink-50 px-4 py-3.5">
            <p className="text-xs leading-relaxed text-ink-600">
              <span className="font-semibold text-ink-800">If something is not read:</span>{" "}
              nothing is ever guessed. Anything CheckWise cannot decide is listed as a warning
              and waits for you below — the exam will not be marked ready until you have settled
              it.
            </p>
          </li>
        </ol>
      )}
    </section>
  );
}
