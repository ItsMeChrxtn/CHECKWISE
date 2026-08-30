import { useState } from "react";
import { ChevronDown, ListChecks } from "lucide-react";

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
    title: "Setting the marks per item",
    body: "Put the count and the points in the section heading:",
    examples: ["TEST I: MULTIPLE CHOICE (40 items, 1 point each)"],
    note: "Left out, every item in the section is worth 1 point.",
  },
];

export default function FormatGuide({ defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

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
            Seven rules — numbering, section headings, and how to mark the answer. Same for a
            short quiz or a long final.
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
