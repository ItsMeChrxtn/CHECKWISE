import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import Button from "./Button.jsx";
import Input from "./Input.jsx";
import Modal from "./Modal.jsx";
import Select from "./Select.jsx";
import Textarea from "./Textarea.jsx";
import { QUESTION_TYPE_OPTIONS } from "../config/questionTypes.js";

/**
 * Write or edit one question by hand.
 *
 * The six types the grader understands need different things, so the middle of
 * the form swaps rather than showing every field and leaving the teacher to
 * work out which apply — choosing True or False should not leave a choices
 * editor on screen.
 *
 * Nothing is sent from here. The caller collects the questions and saves them
 * in one PUT /exams/:id/questions, the same call the PDF path produces, so an
 * exam written by hand and one read off a paper are indistinguishable by the
 * time they reach grading.
 *
 * Mirrors mobile/lib/screens/question_editor_screen.dart field for field.
 */
const BLANK = {
  questionType: "multiple-choice",
  section: "",
  questionText: "",
  choices: ["", "", "", ""],
  correctIndex: 0,
  truth: "TRUE",
  answers: "",
  items: ["", ""],
  points: 1,
};

/** Turns a stored question back into the shape this form edits. */
function toForm(question, fallbackSection, fallbackType) {
  if (!question) {
    return { ...BLANK, section: fallbackSection || "", questionType: fallbackType || BLANK.questionType };
  }

  const type = question.questionType;
  const letters = question.correctAnswers?.[0]?.trim().toUpperCase() ?? "";
  const correctIndex =
    letters.length === 1 && letters >= "A" && letters <= "H" ? letters.charCodeAt(0) - 65 : 0;

  return {
    questionType: type,
    section: question.section || "",
    questionText: question.questionText || "",
    choices: question.choices?.length ? [...question.choices] : ["", "", "", ""],
    correctIndex,
    truth:
      type === "modified-true-false"
        ? question.truthValue || "TRUE"
        : question.correctAnswers?.[0]?.toUpperCase() === "FALSE"
          ? "FALSE"
          : "TRUE",
    answers:
      type === "modified-true-false"
        ? (question.correctionAnswers ?? []).join(", ")
        : type === "enumeration"
          ? ""
          : (question.correctAnswers ?? []).join(", "),
    items:
      type === "enumeration" && question.correctAnswers?.length
        ? [...question.correctAnswers]
        : ["", ""],
    points: question.points ?? 1,
  };
}

const split = (raw) =>
  raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

export default function QuestionEditor({
  open,
  question,
  defaultSection,
  defaultType,
  onCancel,
  onSave,
}) {
  const [form, setForm] = useState(() => toForm(question, defaultSection, defaultType));
  const [error, setError] = useState(null);

  // Re-seed whenever a different question is opened.
  useEffect(() => {
    if (open) {
      setForm(toForm(question, defaultSection, defaultType));
      setError(null);
    }
  }, [open, question, defaultSection, defaultType]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const type = form.questionType;

  const isChoice = type === "multiple-choice";
  const isTrueFalse = type === "true-false";
  const isModified = type === "modified-true-false";
  const isEnumeration = type === "enumeration";

  function submit() {
    if (!form.questionText.trim()) return setError("Write the question.");

    const points = Number(form.points);
    if (!Number.isFinite(points) || points <= 0 || points > 100) {
      return setError("Points must be between 1 and 100.");
    }

    const base = {
      questionType: type,
      section: form.section.trim(),
      questionText: form.questionText.trim(),
      points,
      choices: [],
      correctAnswers: [],
      truthValue: null,
      correctionAnswers: [],
      enumerationCount: null,
    };

    if (isChoice) {
      const choices = form.choices.map((c) => c.trim()).filter(Boolean);
      if (choices.length < 2) return setError("Give at least two options.");
      if (!form.choices[form.correctIndex]?.trim()) {
        return setError("The option you marked correct has no text.");
      }
      onSave({
        ...base,
        choices,
        correctAnswers: [String.fromCharCode(65 + form.correctIndex)],
      });
    } else if (isTrueFalse) {
      onSave({ ...base, choices: ["TRUE", "FALSE"], correctAnswers: [form.truth] });
    } else if (isModified) {
      const correction = split(form.answers);
      if (form.truth === "FALSE" && correction.length === 0) {
        return setError("A false statement needs the word that corrects it.");
      }
      onSave({
        ...base,
        choices: ["TRUE", "FALSE"],
        correctAnswers: [form.truth],
        truthValue: form.truth,
        correctionAnswers: correction,
      });
    } else if (isEnumeration) {
      const items = form.items.map((i) => i.trim()).filter(Boolean);
      if (items.length === 0) return setError("List at least one item.");
      onSave({ ...base, correctAnswers: items, enumerationCount: items.length });
    } else {
      const answers = split(form.answers);
      if (answers.length === 0) return setError("Give at least one accepted answer.");
      onSave({ ...base, correctAnswers: answers });
    }
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={question ? "Edit question" : "New question"}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={submit}>{question ? "Save question" : "Add question"}</Button>
        </>
      }
    >
      <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        <Select
          label="Question type"
          value={type}
          onChange={(event) => set({ questionType: event.target.value })}
          options={QUESTION_TYPE_OPTIONS}
        />

        <Textarea
          label="Question text"
          rows={3}
          value={form.questionText}
          onChange={(event) => set({ questionText: event.target.value })}
          placeholder="What does the useState hook return?"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
          <Input
            label="Section (optional)"
            value={form.section}
            onChange={(event) => set({ section: event.target.value })}
            placeholder="TEST I: MULTIPLE CHOICE"
          />
          <Input
            label="Points"
            type="number"
            min="1"
            max="100"
            value={form.points}
            onChange={(event) => set({ points: event.target.value })}
          />
        </div>

        <div className="border-t border-ink-200 pt-4">
          {isChoice && <ChoiceFields form={form} set={set} />}
          {(isTrueFalse || isModified) && (
            <TruthFields
              form={form}
              set={set}
              label={isModified ? "Is the statement true?" : "The correct answer"}
            />
          )}
          {isModified && (
            <div className="mt-4">
              <Input
                label="Correcting word"
                hint="If the statement is false, what makes it true? Separate accepted spellings with commas."
                value={form.answers}
                onChange={(event) => set({ answers: event.target.value })}
                placeholder="JavaScript, JS"
              />
            </div>
          )}
          {isEnumeration && <ItemFields form={form} set={set} />}
          {!isChoice && !isTrueFalse && !isModified && !isEnumeration && (
            <Input
              label="Accepted answers"
              hint="Every spelling you will accept, separated by commas. Any one earns the mark."
              value={form.answers}
              onChange={(event) => set({ answers: event.target.value })}
              placeholder="ReactJS, React, React.js"
            />
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-md bg-fail-50 px-3 py-2 text-sm text-fail-700">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

function ChoiceFields({ form, set }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-ink-700">
        Options — select the one that is correct
      </p>
      <div className="space-y-2">
        {form.choices.map((choice, index) => {
          const letter = String.fromCharCode(65 + index);
          const selected = form.correctIndex === index;

          return (
            <div key={index} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => set({ correctIndex: index })}
                aria-label={`Mark ${letter} correct`}
                aria-pressed={selected}
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border text-sm font-semibold transition-colors ${
                  selected
                    ? "border-pass-600 bg-pass-50 text-pass-700"
                    : "border-ink-300 text-ink-500 hover:border-ink-400"
                }`}
              >
                {letter}
              </button>
              <input
                value={choice}
                onChange={(event) => {
                  const next = [...form.choices];
                  next[index] = event.target.value;
                  set({ choices: next });
                }}
                placeholder={`Option ${letter}`}
                className="h-11 w-full rounded-lg border border-ink-300 bg-white px-3.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
              {form.choices.length > 2 && (
                <button
                  type="button"
                  aria-label={`Remove option ${letter}`}
                  onClick={() => {
                    const next = form.choices.filter((_, i) => i !== index);
                    set({
                      choices: next,
                      correctIndex: Math.min(form.correctIndex, next.length - 1),
                    });
                  }}
                  className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {form.choices.length < 8 && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => set({ choices: [...form.choices, ""] })}
        >
          <Plus size={15} aria-hidden="true" />
          Add option
        </Button>
      )}
    </div>
  );
}

function TruthFields({ form, set, label }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-ink-700">{label}</p>
      <div className="grid grid-cols-2 gap-3">
        {["TRUE", "FALSE"].map((value) => {
          const selected = form.truth === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => set({ truth: value })}
              aria-pressed={selected}
              className={`rounded-lg border py-3 text-sm font-semibold transition-colors ${
                selected
                  ? "border-brand-400 bg-brand-50 text-brand-700"
                  : "border-ink-300 text-ink-500 hover:border-ink-400"
              }`}
            >
              {value}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ItemFields({ form, set }) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-ink-700">Items to list</p>
      <p className="mb-2 text-xs text-ink-500">
        Every item the student must give. Each correct one earns a share of the marks.
      </p>
      <div className="space-y-2">
        {form.items.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-sm font-medium text-ink-400">{index + 1}.</span>
            <input
              value={item}
              onChange={(event) => {
                const next = [...form.items];
                next[index] = event.target.value;
                set({ items: next });
              }}
              placeholder="HTML"
              className="h-11 w-full rounded-lg border border-ink-300 bg-white px-3.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
            {form.items.length > 1 && (
              <button
                type="button"
                aria-label={`Remove item ${index + 1}`}
                onClick={() => set({ items: form.items.filter((_, i) => i !== index) })}
                className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-600"
              >
                <X size={16} />
              </button>
            )}
          </div>
        ))}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2"
        onClick={() => set({ items: [...form.items, ""] })}
      >
        <Plus size={15} aria-hidden="true" />
        Add item
      </Button>
    </div>
  );
}
