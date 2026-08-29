import { Fragment, useRef, useState } from "react";
import {
  CheckCircle2,
  Download,
  FileText,
  FileUp,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import Button from "./Button.jsx";
import { examService } from "../services/examService.js";
import { useToast } from "../hooks/useToast.js";
import { questionTypeLabel } from "../config/questionTypes.js";

const MAX_MB = 15;

/**
 * The upload → review → confirm → answer sheet workflow.
 *
 * The exam's own `status` decides what is on screen, so the panel can never
 * offer a step the server would reject: a sheet cannot be generated before the
 * key is confirmed, and confirming is impossible before a PDF is read.
 */
export default function ExamDocumentPanel({ exam, onChange }) {
  const toast = useToast();
  const inputRef = useRef(null);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState("");
  const [report, setReport] = useState(null);

  async function upload(file) {
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast.error("CheckWise reads PDF files. Export your exam from Word as a PDF.");
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`That file is larger than ${MAX_MB} MB.`);
      return;
    }

    setUploading(true);
    setProgress(0);
    setReport(null);
    try {
      const response = await examService.uploadDocument(exam._id, file, setProgress);
      setReport(response.data.parse);
      onChange(response.data.exam);
      toast.success(response.message);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function run(action, fn) {
    setBusy(action);
    try {
      const response = await fn();
      if (response?.data?.exam) onChange(response.data.exam);
      if (response?.message) toast.success(response.message);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy("");
    }
  }

  function onDrop(event) {
    event.preventDefault();
    setDragging(false);
    upload(event.dataTransfer.files?.[0]);
  }

  const hasDocument = Boolean(exam.examPdfPath);

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink-200 px-5 py-3.5">
        <h3 className="text-sm font-semibold text-ink-800">Exam document</h3>
        {hasDocument && (
          <span className="flex min-w-0 items-center gap-1.5 text-sm text-ink-500">
            <FileText size={14} aria-hidden="true" />
            <span className="truncate">{exam.examPdfOriginalName}</span>
          </span>
        )}
      </div>

      <div className="space-y-4 p-5">
        {!hasDocument ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={[
              "rounded-xl border-2 border-dashed px-5 py-8 text-center transition-colors",
              dragging ? "border-brand-500 bg-brand-50" : "border-ink-300 bg-ink-50/50",
            ].join(" ")}
          >
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-sm border border-ink-200 bg-white text-brand-600">
              <FileUp size={20} aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-semibold text-ink-800">
              Upload your finished exam as a PDF
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
              CheckWise reads the questions and the answer key from the file, then builds the
              answer sheet for you. Number the items 1., 2., 3. and mark each answer the way you
              already do — <span className="font-medium">highlight it</span>, write it before the
              number, put <span className="font-medium">ANSWER: B</span> beside the question, or
              list them under an <span className="font-medium">ANSWER KEY</span> heading.
            </p>

            <div className="mt-4">
              <Button loading={uploading} onClick={() => inputRef.current?.click()}>
                <FileUp size={16} aria-hidden="true" />
                {uploading ? `Reading… ${progress}%` : "Choose PDF"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              loading={uploading}
              onClick={() => inputRef.current?.click()}
            >
              <RefreshCw size={16} aria-hidden="true" />
              {uploading ? `Reading… ${progress}%` : "Replace PDF"}
            </Button>

            {exam.status === "needs-review" && (
              <Button
                loading={busy === "confirm"}
                onClick={() => run("confirm", () => examService.confirmKey(exam._id))}
              >
                <CheckCircle2 size={16} aria-hidden="true" />
                Confirm answer key
              </Button>
            )}

            {exam.status === "ready" && (
              <>
                <Button
                  loading={busy === "sheet"}
                  onClick={() => run("sheet", () => examService.generateAnswerSheet(exam._id))}
                >
                  <FileText size={16} aria-hidden="true" />
                  {exam.answerSheetPath ? "Regenerate answer sheet" : "Generate answer sheet"}
                </Button>

                {exam.answerSheetPath && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      examService
                        .downloadAnswerSheet(exam._id, exam.examCode)
                        .catch((err) => toast.error(err.message))
                    }
                  >
                    <Download size={16} aria-hidden="true" />
                    Download sheet
                  </Button>
                )}
              </>
            )}
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="sr-only"
          onChange={(e) => upload(e.target.files?.[0])}
        />

        {report?.warnings?.length > 0 && (
          <div className="rounded-lg border border-warn-100 bg-warn-50 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-warn-700">
              <TriangleAlert size={15} aria-hidden="true" />
              {report.warnings.length} item{report.warnings.length === 1 ? "" : "s"} need your
              attention
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-warn-700">
              {report.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        {exam.questions.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-ink-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="w-12 px-3 py-2 font-semibold">#</th>
                  <th className="px-3 py-2 font-semibold">Question</th>
                  <th className="w-44 px-3 py-2 font-semibold">Type</th>
                  <th className="w-40 px-3 py-2 font-semibold">Answer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {exam.questions.map((question, index) => (
                  <Fragment key={question.questionNumber}>
                    {/* Sections restart their numbering, so name each one once. */}
                    {question.section &&
                      question.section !== exam.questions[index - 1]?.section && (
                        <tr className="bg-ink-50">
                          <td
                            colSpan={4}
                            className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-600"
                          >
                            {question.section}
                          </td>
                        </tr>
                      )}
                    <tr className="align-top">
                    <td className="px-3 py-2 font-semibold text-ink-700">
                      {question.sectionNumber ?? question.questionNumber}
                    </td>
                    <td className="px-3 py-2 text-ink-700">
                      <span className="line-clamp-2">{question.questionText || "—"}</span>
                    </td>
                    <td className="px-3 py-2 text-ink-500">
                      {questionTypeLabel(question.questionType)}
                    </td>
                    <td className="px-3 py-2 font-medium text-ink-800">
                      {formatAnswer(question)}
                    </td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

/** Renders whichever answer field the question's type actually grades on. */
function formatAnswer(question) {
  if (question.questionType === "modified-true-false") {
    if (!question.truthValue) return "—";
    return question.correctionAnswers.length > 0
      ? `${question.truthValue} → ${question.correctionAnswers.join(" / ")}`
      : question.truthValue;
  }
  return question.correctAnswers.length > 0 ? question.correctAnswers.join(", ") : "—";
}
