import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  ClipboardCopy,
  FileCheck2,
  FileUp,
  Pencil,
  Trash2,
} from "lucide-react";
import Button from "../components/Button.jsx";
import ExamDocumentPanel from "../components/ExamDocumentPanel.jsx";
import ExamResultsPanel from "../components/ExamResultsPanel.jsx";
import ExamAnalysisPanel from "../components/ExamAnalysisPanel.jsx";
import Modal from "../components/Modal.jsx";
import StatusBadge, { EXAM_STATUS_META } from "../components/StatusBadge.jsx";
import { EmptyState, ErrorState, Spinner } from "../components/States.jsx";
import { examService } from "../services/examService.js";
import { useAuth } from "../hooks/useAuth.js";
import { useToast } from "../hooks/useToast.js";
import { questionTypeLabel } from "../config/questionTypes.js";
import { formatDateTime } from "../utils/format.js";

export default function ExamDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { isAdmin } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await examService.get(id));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(data.exam.examCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can be blocked; the code is on screen to copy by hand.
      toast.error("Could not copy automatically. Select the code to copy it.");
    }
  }

  /** Every workflow step returns the saved exam, so the page never refetches. */
  function applyExam(exam) {
    setData((previous) => ({ ...previous, exam }));
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      const response = await examService.remove(id);
      toast.success(response.message);
      navigate("/exams", { replace: true });
    } catch (err) {
      toast.error(err.message);
      setDeleting(false);
      setConfirmOpen(false);
    }
  }

  if (loading) return <Spinner label="Loading exam" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const { exam, resultCount } = data;
  const { gradingConfig = {} } = exam;

  // Group the questions by type for an at-a-glance breakdown. Empty until the
  // answer key is parsed, which is why the panel below explains the next step.
  const byType = exam.questions.reduce((acc, question) => {
    const entry = acc[question.questionType] ?? { count: 0, points: 0 };
    entry.count += 1;
    entry.points += question.points ?? 0;
    acc[question.questionType] = entry;
    return acc;
  }, {});

  const details = [
    { label: "Subject", value: exam.subject },
    { label: "Passing score", value: `${exam.passingScore}%` },
    {
      label: "Modified T/F scoring",
      value:
        gradingConfig.modifiedTrueFalseScoring === "split"
          ? "Truth value 1 pt + correction 1 pt"
          : "1 point per complete question",
    },
    {
      label: "Enumeration partial credit",
      value: gradingConfig.enumerationPartialCredit ? "Enabled" : "Disabled",
    },
    {
      label: "Written answers",
      value:
        gradingConfig.strictWrittenAnswers === false
          ? "Small misspellings forgiven"
          : "Must match the key exactly",
    },
    { label: "Answer sheets checked", value: resultCount },
    { label: "Created", value: formatDateTime(exam.createdAt) },
    { label: "Last updated", value: formatDateTime(exam.updatedAt) },
  ];

  if (isAdmin && exam.teacherId?.name) {
    details.splice(1, 0, { label: "Teacher", value: exam.teacherId.name });
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          to="/exams"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-700"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to exams
        </Link>
      </div>

      <header className="card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-xl font-bold tracking-tight text-ink-900">{exam.title}</h2>
              <StatusBadge status={exam.status} />
            </div>

            {exam.description && (
              <p className="mt-2 max-w-prose text-sm text-ink-600">{exam.description}</p>
            )}

            <div className="mt-3 flex items-center gap-2">
              <span className="rounded-md bg-brand-50 px-2.5 py-1 font-mono text-sm font-semibold text-brand-700">
                {exam.examCode}
              </span>
              <button
                type="button"
                onClick={copyCode}
                aria-label="Copy exam code"
                title="Copy exam code"
                className="grid h-8 w-8 place-items-center rounded-md text-ink-500 hover:bg-ink-100 hover:text-ink-700"
              >
                {copied ? (
                  <Check size={16} className="text-pass-600" aria-hidden="true" />
                ) : (
                  <ClipboardCopy size={16} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <div className="flex shrink-0 gap-2">
            <Link to={`/exams/${exam._id}/edit`}>
              <Button variant="secondary">
                <Pencil size={16} aria-hidden="true" />
                Edit
              </Button>
            </Link>
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              <Trash2 size={16} aria-hidden="true" />
              Delete
            </Button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <section className="card overflow-hidden lg:col-span-1">
          <h3 className="border-b border-ink-200 px-5 py-3.5 text-sm font-semibold text-ink-800">
            Exam details
          </h3>
          <dl className="divide-y divide-ink-100">
            {details.map(({ label, value }) => (
              <div key={label} className="flex items-start gap-3 px-5 py-3">
                <dt className="w-44 shrink-0 text-sm text-ink-500">{label}</dt>
                <dd className="min-w-0 flex-1 text-sm font-medium text-ink-800">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="card overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between border-b border-ink-200 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-ink-800">Questions</h3>
            {exam.totalQuestions > 0 && (
              <p className="text-sm text-ink-500">
                {exam.totalQuestions} questions · {exam.totalPoints} points
              </p>
            )}
          </div>

          {exam.totalQuestions === 0 ? (
            <EmptyState
              icon={FileUp}
              title="No questions yet"
              description="Upload your exam PDF below. CheckWise reads the questions and the answer key straight from the file."
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {Object.entries(byType).map(([type, { count, points }]) => (
                <li key={type} className="flex items-center justify-between gap-3 px-5 py-3">
                  <span className="text-sm font-medium text-ink-800">
                    {questionTypeLabel(type)}
                  </span>
                  <span className="text-sm text-ink-500">
                    {count} {count === 1 ? "question" : "questions"} · {points} pts
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <ExamDocumentPanel exam={exam} onChange={applyExam} />

      <ExamResultsPanel exam={exam} />

      <ExamAnalysisPanel exam={exam} />

      <section className="card flex items-start gap-3 p-5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-sm border border-brand-100 bg-brand-50 text-brand-700">
          <FileCheck2 size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-800">
            Next: {EXAM_STATUS_META[exam.status]?.hint}
          </p>
          <p className="mt-1 text-sm text-ink-500">
            Written answers are typed in on each paper — handwriting is not read automatically.
            Class reports and CSV export arrive in Phase 7 and 8.
          </p>
        </div>
      </section>

      <Modal
        open={confirmOpen}
        onClose={() => !deleting && setConfirmOpen(false)}
        title="Delete this exam?"
        description={
          resultCount > 0
            ? `"${exam.title}" and the ${resultCount} result${resultCount === 1 ? "" : "s"} recorded against it will be permanently removed. This cannot be undone.`
            : `"${exam.title}" will be permanently removed. This cannot be undone.`
        }
        footer={
          <>
            <Button variant="secondary" disabled={deleting} onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={deleting} onClick={confirmDelete}>
              Delete exam
            </Button>
          </>
        }
      />
    </div>
  );
}
