import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { ArrowLeft, Save } from "lucide-react";
import Button from "../components/Button.jsx";
import Input from "../components/Input.jsx";
import Textarea from "../components/Textarea.jsx";
import { ErrorState, Spinner } from "../components/States.jsx";
import { examService } from "../services/examService.js";
import { useToast } from "../hooks/useToast.js";

const MTF_OPTIONS = [
  {
    value: "whole",
    label: "1 point per complete question",
    description:
      "The truth value and the correction must both be right to earn the point.",
  },
  {
    value: "split",
    label: "Truth value = 1 point, correction = 1 point",
    description:
      "Scored independently, so a student can earn partial credit on a FALSE item.",
  },
];

const DEFAULTS = {
  title: "",
  subject: "",
  description: "",
  passingScore: 75,
  modifiedTrueFalseScoring: "whole",
  enumerationPartialCredit: true,
  strictWrittenAnswers: true,
};

/** Shared create/edit form - `id` in the URL switches it to edit mode. */
export default function ExamForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();

  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: DEFAULTS });

  const selectedScoring = watch("modifiedTrueFalseScoring");

  const loadExam = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const { exam } = await examService.get(id);
      reset({
        title: exam.title,
        subject: exam.subject,
        description: exam.description || "",
        passingScore: exam.passingScore,
        modifiedTrueFalseScoring: exam.gradingConfig?.modifiedTrueFalseScoring ?? "whole",
        enumerationPartialCredit: exam.gradingConfig?.enumerationPartialCredit ?? true,
        strictWrittenAnswers: exam.gradingConfig?.strictWrittenAnswers ?? true,
      });
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id, reset]);

  useEffect(() => {
    if (isEdit) loadExam();
  }, [isEdit, loadExam]);

  async function onSubmit(values) {
    setFormError("");
    const payload = { ...values, passingScore: Number(values.passingScore) };

    try {
      const exam = isEdit
        ? await examService.update(id, payload)
        : await examService.create(payload);

      toast.success(isEdit ? "Exam updated." : `"${exam.title}" has been created.`);
      navigate(`/exams/${exam._id}`, { replace: true });
    } catch (err) {
      if (err.errors) {
        Object.entries(err.errors).forEach(([field, message]) =>
          setError(field, { type: "server", message })
        );
      } else {
        setFormError(err.message);
      }
    }
  }

  if (loading) return <Spinner label="Loading exam" />;
  if (loadError) return <ErrorState message={loadError} onRetry={loadExam} />;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <Link
          to={isEdit ? `/exams/${id}` : "/exams"}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-700"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          {isEdit ? "Back to exam" : "Back to exams"}
        </Link>

        <h2 className="mt-3 text-xl font-bold tracking-tight text-ink-900">
          {isEdit ? "Edit exam" : "Create a new exam"}
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          {isEdit
            ? "Update the exam details and how it is graded."
            : "Set up the exam details. You will upload the answer key next, and the questions come from it."}
        </p>
      </div>

      {formError && (
        <p
          role="alert"
          className="rounded-lg border border-fail-100 bg-fail-50 p-3 text-sm text-fail-700"
        >
          {formError}
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <section className="card space-y-4 p-5">
          <h3 className="text-sm font-semibold text-ink-800">Exam details</h3>

          <Input
            label="Exam title"
            placeholder="Midterm Examination"
            error={errors.title?.message}
            {...register("title", {
              required: "Exam title is required.",
              minLength: { value: 3, message: "Title must be at least 3 characters." },
              maxLength: { value: 160, message: "Title must be at most 160 characters." },
            })}
          />

          <Input
            label="Subject"
            placeholder="Web Development"
            error={errors.subject?.message}
            {...register("subject", {
              required: "Subject is required.",
              minLength: { value: 2, message: "Subject must be at least 2 characters." },
              maxLength: { value: 120, message: "Subject must be at most 120 characters." },
            })}
          />

          <Textarea
            label="Description"
            placeholder="What this exam covers (optional)"
            hint="Optional. Shown on the exam details page."
            error={errors.description?.message}
            {...register("description", {
              maxLength: { value: 1000, message: "Description must be at most 1000 characters." },
            })}
          />

          <Input
            label="Passing score"
            type="number"
            min={1}
            max={100}
            hint="The percentage a student must reach to pass."
            error={errors.passingScore?.message}
            {...register("passingScore", {
              required: "Passing score is required.",
              valueAsNumber: true,
              min: { value: 1, message: "Passing score must be at least 1." },
              max: { value: 100, message: "Passing score must be at most 100." },
              validate: (value) =>
                Number.isInteger(value) || "Passing score must be a whole number.",
            })}
          />
        </section>

        <section className="card space-y-4 p-5">
          <div>
            <h3 className="text-sm font-semibold text-ink-800">Grading configuration</h3>
            <p className="mt-1 text-sm text-ink-500">
              How CheckWise awards marks for the question types that can be partly correct.
            </p>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink-700">
              Modified True or False scoring
            </legend>

            <div className="space-y-2">
              {MTF_OPTIONS.map((option) => {
                const isSelected = selectedScoring === option.value;
                return (
                  <label
                    key={option.value}
                    className={
                      isSelected
                        ? "flex cursor-pointer gap-3 rounded-lg border-2 border-brand-500 bg-brand-50/50 p-3.5"
                        : "flex cursor-pointer gap-3 rounded-lg border-2 border-ink-200 p-3.5 hover:border-ink-300"
                    }
                  >
                    <input
                      type="radio"
                      value={option.value}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
                      {...register("modifiedTrueFalseScoring")}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink-800">{option.label}</span>
                      <span className="mt-0.5 block text-xs text-ink-500">
                        {option.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <label className="flex cursor-pointer gap-3 rounded-lg border border-ink-200 p-3.5">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
              {...register("enumerationPartialCredit")}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink-800">
                Partial credit for enumeration
              </span>
              <span className="mt-0.5 block text-xs text-ink-500">
                Award one point per correct item. Listing 2 of 3 correctly scores 2 out of 3.
                Turn this off to require every item.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer gap-3 rounded-lg border border-ink-200 p-3.5">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
              {...register("strictWrittenAnswers")}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink-800">
                Written answers must match the key exactly
              </span>
              <span className="mt-0.5 block text-xs text-ink-500">
                Only the spellings in your answer key are correct; capitals and punctuation are
                still ignored. Turn this off to forgive small misspellings — worth considering for
                scanned papers, because the handwriting reader makes its own mistakes and those
                would otherwise cost the student marks.
              </span>
            </span>
          </label>
        </section>

        <div className="flex items-center justify-end gap-2">
          <Link to={isEdit ? `/exams/${id}` : "/exams"}>
            <Button variant="secondary" type="button">
              Cancel
            </Button>
          </Link>
          <Button type="submit" loading={isSubmitting}>
            {!isSubmitting && <Save size={17} aria-hidden="true" />}
            {isEdit ? "Save changes" : "Create exam"}
          </Button>
        </div>
      </form>
    </div>
  );
}
