import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FileCheck2, TriangleAlert } from "lucide-react";
import Input from "../components/Input.jsx";
import Select from "../components/Select.jsx";
import StatCard from "../components/StatCard.jsx";
import { EmptyState, ErrorState, Spinner } from "../components/States.jsx";
import { resultService } from "../services/resultService.js";
import { useAuth } from "../hooks/useAuth.js";
import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import { formatDateTime, percent } from "../utils/format.js";

/**
 * Every scanned paper.
 *
 * The server decides the scope: a teacher gets their own, an administrator gets
 * the whole installation. Nothing here filters by owner, so the two roles share
 * one page and there is no second implementation to drift.
 *
 * Searching and filtering happen in the browser because the endpoint returns a
 * capped, recent slice rather than the full history — filtering server-side
 * would imply a completeness this list does not have.
 */
export default function Results() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [state, setState] = useState({ loading: true, error: null, results: [] });
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState("all");

  const q = useDebouncedValue(search, 300).trim().toLowerCase();

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const results = await resultService.listAll(100);
      setState({ loading: false, error: null, results });
    } catch (error) {
      setState({ loading: false, error: error.message, results: [] });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { loading, error, results } = state;

  const shown = useMemo(() => {
    return results.filter((r) => {
      if (outcome === "passed" && !r.passed) return false;
      if (outcome === "failed" && r.passed) return false;
      if (outcome === "review" && !needsReview(r)) return false;
      if (!q) return true;
      return (
        r.studentName?.toLowerCase().includes(q) ||
        r.studentId?.toLowerCase().includes(q) ||
        r.examId?.title?.toLowerCase().includes(q) ||
        r.examId?.examCode?.toLowerCase().includes(q)
      );
    });
  }, [results, q, outcome]);

  const summary = useMemo(() => {
    if (results.length === 0) return null;
    const passed = results.filter((r) => r.passed).length;
    const flagged = results.filter(needsReview).length;
    const average =
      results.reduce((sum, r) => sum + (r.percentage || 0), 0) / results.length;
    return { checked: results.length, passed, flagged, average };
  }, [results]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-ink-900">
          {isAdmin ? "All results" : "Results"}
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          {isAdmin
            ? "Every paper scanned on this installation, newest first."
            : "Every paper you have scanned, newest first."}
        </p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatCard icon={FileCheck2} label="Papers checked" value={summary.checked} />
          <StatCard icon={FileCheck2} label="Passed" value={summary.passed} tone="emerald" />
          <StatCard
            icon={TriangleAlert}
            label="Need review"
            value={summary.flagged}
            tone="amber"
          />
          <StatCard icon={FileCheck2} label="Average" value={percent(summary.average)} />
        </div>
      )}

      <div className="card">
        <div className="flex flex-col gap-3 border-b border-ink-200 p-4 sm:flex-row">
          <Input
            className="flex-1"
            placeholder="Search student, exam or code"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select
            className="sm:w-52"
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
            options={[
              { value: "all", label: "All outcomes" },
              { value: "passed", label: "Passed" },
              { value: "failed", label: "Did not pass" },
              { value: "review", label: "Needs review" },
            ]}
          />
        </div>

        {loading ? (
          <Spinner label="Loading results" />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={FileCheck2}
            title={results.length === 0 ? "No papers yet" : "No papers match"}
            description={
              results.length === 0
                ? "Scan a completed answer sheet and the scores will collect here."
                : "Try a different search or outcome filter."
            }
          />
        ) : (
          <ul className="ruled">
            {shown.map((result) => (
              <ResultRow key={result._id} result={result} showOwner={isAdmin} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Anything the scanner declined to settle on its own. */
function needsReview(result) {
  return (
    (result.pendingReview || 0) + (result.ambiguousAnswers || 0) + (result.blankAnswers || 0) > 0
  );
}

function ResultRow({ result, showOwner }) {
  const flagged = needsReview(result);
  const exam = result.examId;

  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="flex items-baseline gap-3 sm:w-24 sm:shrink-0">
        <span className={`figure text-2xl ${result.passed ? "text-pass-700" : "text-fail-700"}`}>
          {Math.round(result.percentage)}%
        </span>
        <span className="text-xs font-semibold text-ink-400 sm:hidden">
          {result.passed ? "Passed" : "Did not pass"}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink-900">{result.studentName}</p>
        <p className="truncate text-sm text-ink-500">
          {exam?.title || "Exam removed"}
          {exam?.examCode && <span className="text-ink-400"> · {exam.examCode}</span>}
        </p>
        <p className="mt-1 text-xs text-ink-400">
          {result.score} / {result.totalPoints} points · {formatDateTime(result.createdAt)}
          {showOwner && result.teacherId?.name && (
            <span> · scanned by {result.teacherId.name}</span>
          )}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {flagged && (
          <span className="inline-flex items-center gap-1 rounded-sm bg-warn-50 px-2 py-1 text-[11px] font-semibold text-warn-700">
            <TriangleAlert size={12} aria-hidden="true" />
            Needs review
          </span>
        )}
        <span
          className={`hidden rounded-sm px-2 py-1 text-[11px] font-semibold sm:inline ${
            result.passed ? "bg-pass-50 text-pass-700" : "bg-fail-50 text-fail-700"
          }`}
        >
          {result.passed ? "Passed" : "Did not pass"}
        </span>
        {exam?._id && (
          <Link
            to={`/exams/${exam._id}`}
            className="text-sm font-semibold text-brand-700 hover:text-brand-800"
          >
            Open exam
          </Link>
        )}
      </div>
    </li>
  );
}
