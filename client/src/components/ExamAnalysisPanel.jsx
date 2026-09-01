import { useCallback, useEffect, useState } from "react";
import { BarChart3, Download, RefreshCw, TriangleAlert } from "lucide-react";
import Button from "./Button.jsx";
import { EmptyState, Spinner } from "./States.jsx";
import { examService } from "../services/examService.js";
import { useToast } from "../hooks/useToast.js";
import { questionTypeLabel } from "../config/questionTypes.js";

/**
 * How the class did on every item, rather than how each student did overall.
 *
 * A gradebook answers "who passed". This answers "was the paper any good" -
 * which item nobody got, which one the strong students got wrong more often
 * than the weak ones (almost always a wording problem), and which distractor is
 * doing the damage. Those are the figures a study has to report, so they are
 * shown as the standard indices under their usual names and can be taken out as
 * CSV rather than retyped.
 */
export default function ExamAnalysisPanel({ exam }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await examService.analysis(exam._id));
    } catch (err) {
      setError(err.response?.data?.message || "The analysis could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [exam._id]);

  useEffect(() => {
    load();
  }, [load]);

  const exportCsv = () => {
    if (!data?.items?.length) return;

    const rows = [
      [
        "Item",
        "Section",
        "Type",
        "Key",
        "Points",
        "Papers",
        "Correct",
        "Wrong",
        "Blank",
        "Needs review",
        "Difficulty (p)",
        "Difficulty label",
        "Discrimination (D)",
        "Discrimination label",
        "Most given answer",
      ],
      ...data.items.map((item) => [
        item.questionNumber,
        item.section,
        item.questionType,
        item.correctAnswer,
        item.pointsPossible,
        item.attempts,
        item.correct,
        item.wrong,
        item.blank,
        item.pending,
        item.difficulty ?? "",
        item.difficultyLabel,
        item.discrimination ?? "",
        item.discriminationLabel,
        item.choices[0]?.answer ?? "",
      ]),
    ];

    // Quote every field: answers and section names contain commas often enough
    // that not quoting them would silently shift columns.
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\r\n");

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${exam.examCode || "exam"}-item-analysis.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast.success("Item analysis exported.");
  };

  const summary = data?.summary;
  const items = data?.items ?? [];
  const flagged = items.filter((item) => item.discrimination !== null && item.discrimination < 0);

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600">
            <BarChart3 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-ink-900">Item analysis</h2>
            <p className="text-xs text-ink-500">
              How the class did on each number, not just overall.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button variant="secondary" onClick={exportCsv} disabled={!items.length}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="grid place-items-center py-12">
          <Spinner />
        </div>
      ) : error ? (
        <p className="px-5 py-8 text-center text-sm text-fail-700">{error}</p>
      ) : !summary || summary.papers === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No papers scanned yet"
          description="Scan a few answer sheets and the per-item figures appear here."
        />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-px border-b border-ink-100 bg-ink-100 sm:grid-cols-3 lg:grid-cols-6">
            <Figure label="Papers" value={summary.papers} />
            <Figure label="Mean" value={`${summary.mean} / ${summary.totalPoints}`} />
            <Figure label="Median" value={summary.median} />
            <Figure label="Std. dev." value={summary.stdDev} />
            <Figure
              label="Cronbach's α"
              value={summary.alpha === null ? "—" : summary.alpha}
              hint={alphaHint(summary.alpha)}
            />
            <Figure label="Passed" value={`${summary.passed} of ${summary.papers}`} />
          </dl>

          {flagged.length > 0 && (
            <p className="flex items-start gap-2 border-b border-warn-100 bg-warn-50 px-5 py-3 text-xs text-warn-700">
              <TriangleAlert className="mt-px h-4 w-4 shrink-0" />
              <span>
                {flagged.length === 1 ? "Item" : "Items"}{" "}
                <strong>{flagged.map((i) => i.questionNumber).join(", ")}</strong>{" "}
                {flagged.length === 1 ? "was" : "were"} answered correctly more often by the students
                who scored lowest overall. That usually means the wording or the key needs a look.
              </span>
            </p>
          )}

          {summary.pendingReview > 0 && (
            <p className="border-b border-ink-100 bg-ink-50 px-5 py-3 text-xs text-ink-600">
              {summary.pendingReview} written answer{summary.pendingReview === 1 ? "" : "s"} still
              need typing in. Those are left out of the rates below rather than counted as wrong.
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-500">
                  <th className="px-5 py-3 font-medium">Item</th>
                  <th className="px-3 py-3 font-medium">Key</th>
                  <th className="px-3 py-3 font-medium">Correct</th>
                  <th className="px-3 py-3 font-medium">Difficulty (p)</th>
                  <th className="px-3 py-3 font-medium">Discrimination (D)</th>
                  <th className="px-5 py-3 font-medium">Most given</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {items.map((item) => (
                  <ItemRow key={item.questionNumber} item={item} />
                ))}
              </tbody>
            </table>
          </div>

          <footer className="border-t border-ink-100 px-5 py-3 text-xs leading-relaxed text-ink-500">
            <strong className="text-ink-600">p</strong> is the share of papers that earned the mark.{" "}
            <strong className="text-ink-600">D</strong> is the top 27% minus the bottom 27% by total
            score; below 0.20 the item is not separating students, and below zero it is working
            against you. <strong className="text-ink-600">α</strong> is Cronbach&apos;s alpha over
            the item marks.
          </footer>
        </>
      )}
    </section>
  );
}

function ItemRow({ item }) {
  const top = item.choices[0];

  return (
    <tr className="align-top">
      <td className="px-5 py-3">
        <p className="font-medium text-ink-900">#{item.questionNumber}</p>
        <p className="text-xs text-ink-500">
          {questionTypeLabel(item.questionType) || item.questionType}
        </p>
      </td>

      <td className="px-3 py-3">
        <span className="rounded bg-ink-50 px-1.5 py-0.5 font-mono text-xs text-ink-700">
          {item.correctAnswer || "—"}
        </span>
      </td>

      <td className="px-3 py-3 text-ink-700">
        {item.correct}
        <span className="text-ink-400"> / {item.graded || item.attempts}</span>
      </td>

      <td className="px-3 py-3">
        {item.difficulty === null ? (
          <span className="text-xs text-ink-400">not yet graded</span>
        ) : (
          <>
            <Meter value={item.difficulty} />
            <p className="mt-1 text-xs text-ink-500">
              {item.difficulty} · {item.difficultyLabel}
            </p>
          </>
        )}
      </td>

      <td className="px-3 py-3">
        <DiscriminationTag item={item} />
      </td>

      <td className="px-5 py-3">
        {top ? (
          <>
            <span
              className={
                top.correct
                  ? "rounded bg-pass-50 px-1.5 py-0.5 font-mono text-xs text-pass-700"
                  : "rounded bg-fail-50 px-1.5 py-0.5 font-mono text-xs text-fail-700"
              }
            >
              {top.answer}
            </span>
            <span className="ml-2 text-xs text-ink-500">
              {top.count} of {item.attempts}
            </span>
          </>
        ) : (
          <span className="text-xs text-ink-400">—</span>
        )}
      </td>
    </tr>
  );
}

/**
 * A bar for the difficulty index.
 *
 * Both ends are a problem - an item everybody gets and one nobody gets tell you
 * equally little - so the middle band is the neutral colour and the extremes
 * are the ones that stand out.
 */
function Meter({ value }) {
  const tone =
    value >= 0.85 || value < 0.15
      ? "bg-warn-600"
      : value >= 0.7 || value < 0.3
        ? "bg-brand-300"
        : "bg-brand-600";

  return (
    <span className="block h-1.5 w-24 overflow-hidden rounded-full bg-ink-100">
      <span
        className={`block h-full rounded-full ${tone}`}
        style={{ width: `${Math.max(2, Math.round(value * 100))}%` }}
      />
    </span>
  );
}

function DiscriminationTag({ item }) {
  if (item.discrimination === null) {
    return <span className="text-xs text-ink-400">not yet graded</span>;
  }

  const tone =
    item.discrimination < 0
      ? "bg-fail-50 text-fail-700"
      : item.discrimination >= 0.3
        ? "bg-pass-50 text-pass-700"
        : item.discrimination >= 0.2
          ? "bg-ink-50 text-ink-600"
          : "bg-warn-50 text-warn-700";

  return (
    <>
      <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${tone}`}>
        {item.discrimination > 0 ? `+${item.discrimination}` : item.discrimination}
      </span>
      <p className="mt-1 text-xs text-ink-500">{item.discriminationLabel}</p>
    </>
  );
}

function Figure({ label, value, hint }) {
  return (
    <div className="bg-white px-5 py-4">
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold text-ink-900">{value}</dd>
      {hint && <p className="text-xs text-ink-400">{hint}</p>}
    </div>
  );
}

function alphaHint(alpha) {
  if (alpha === null) return "needs 2+ papers";
  if (alpha >= 0.9) return "excellent";
  if (alpha >= 0.8) return "good";
  if (alpha >= 0.7) return "acceptable";
  if (alpha >= 0.6) return "questionable";
  return "low";
}
