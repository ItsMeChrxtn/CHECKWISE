import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, ChevronDown, ScanLine, Trash2, TriangleAlert, Video } from "lucide-react";
import Button from "./Button.jsx";
import CameraScanner from "./CameraScanner.jsx";
import Input from "./Input.jsx";
import { Spinner } from "./States.jsx";
import { resultService } from "../services/resultService.js";
import { useToast } from "../hooks/useToast.js";

/**
 * Scanning papers and the scores that come back.
 *
 * A scan settles the bubbles only. Written answers cannot be read by machine
 * yet, so they arrive as "needs typing in" and the teacher fills them here -
 * the paper is regraded server-side on every change, so the score on screen is
 * never a stale sum.
 */
export default function ExamResultsPanel({ exam }) {
  const toast = useToast();
  const inputRef = useRef(null);

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [studentName, setStudentName] = useState("");
  const [files, setFiles] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [openId, setOpenId] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await resultService.listForExam(exam._id);
      setResults(data.results);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
    // toast is stable; exam._id is what actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam._id]);

  useEffect(() => {
    load();
  }, [load]);

  async function scan() {
    if (files.length === 0) {
      toast.error("Choose the photo or scan of the answer sheet first.");
      return;
    }
    setScanning(true);
    setProgress(0);
    try {
      const response = await resultService.scan(
        exam._id,
        { files, studentName: studentName.trim() },
        setProgress
      );
      toast.success(response.message);
      setStudentName("");
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
      await load();
      setOpenId(response.data.result._id);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setScanning(false);
      setProgress(0);
    }
  }

  async function removeResult(id, name) {
    try {
      const response = await resultService.remove(id);
      toast.success(response.message || `${name}'s paper was deleted.`);
      setResults((previous) => previous.filter((r) => r._id !== id));
    } catch (err) {
      toast.error(err.message);
    }
  }

  const ready = exam.status === "ready" && exam.answerSheetPath;

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink-200 px-5 py-3.5">
        <h3 className="text-sm font-semibold text-ink-800">Checked papers</h3>
        {results.length > 0 && (
          <p className="text-sm text-ink-500">
            {results.length} paper{results.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      <div className="space-y-4 p-5">
        {!ready ? (
          <p className="text-sm text-ink-500">
            Generate the answer sheet first. The scanner reads its layout to know where every
            bubble was printed, so papers can only be checked once a sheet exists.
          </p>
        ) : cameraOpen ? (
          <CameraScanner
            exam={exam}
            onScored={() => load()}
            onClose={() => setCameraOpen(false)}
          />
        ) : (
          <div className="rounded-xl border border-ink-200 bg-ink-50/50 p-4">
            <div className="mb-3 flex items-center justify-between gap-3 rounded-lg bg-brand-50 px-3 py-2.5">
              <p className="text-sm text-brand-800">
                <span className="font-semibold">Point and score.</span> Hold the paper up to the
                camera and the sheet is recognised and read by itself.
              </p>
              <Button size="sm" onClick={() => setCameraOpen(true)}>
                <Video size={15} aria-hidden="true" />
                Scan with camera
              </Button>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Input
                  label="Student name (optional)"
                  placeholder="Dela Cruz, Juan"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => inputRef.current?.click()}>
                  <Camera size={16} aria-hidden="true" />
                  {files.length > 0
                    ? `${files.length} file${files.length === 1 ? "" : "s"}`
                    : "Choose scan"}
                </Button>
                <Button loading={scanning} onClick={scan}>
                  <ScanLine size={16} aria-hidden="true" />
                  {scanning ? `Reading… ${progress}%` : "Check paper"}
                </Button>
              </div>
            </div>

            <p className="mt-2 text-xs text-ink-500">
              JPG, PNG or PDF. A PDF straight from a document scanner works as it is — every page
              inside it is read, and each page says which one it is, so the order does not matter.
              Attach all the pages of one student's sheet together. Keep the paper flat and all
              four black corner squares in frame; the scanner squares up the page from them, so a
              photo taken at an angle still reads correctly.
            </p>

            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              multiple
              className="sr-only"
              onChange={(e) => setFiles([...e.target.files])}
            />
          </div>
        )}

        {loading ? (
          <Spinner label="Loading papers" />
        ) : results.length === 0 ? (
          <p className="text-sm text-ink-500">No papers have been checked yet.</p>
        ) : (
          <ul className="divide-y divide-ink-100 overflow-hidden rounded-lg border border-ink-200">
            {results.map((result) => (
              <li key={result._id}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setOpenId(openId === result._id ? null : result._id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <ChevronDown
                      size={16}
                      aria-hidden="true"
                      className={`shrink-0 text-ink-400 transition-transform ${
                        openId === result._id ? "rotate-180" : ""
                      }`}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-800">
                      {result.studentName}
                    </span>
                    <span className="shrink-0 text-sm text-ink-600">
                      {result.score} / {result.totalPoints}
                    </span>
                    <span
                      className={`shrink-0 rounded-sm px-2 py-0.5 text-xs font-semibold ${
                        result.passed
                          ? "bg-pass-50 text-pass-700"
                          : "bg-fail-50 text-fail-700"
                      }`}
                    >
                      {result.percentage}%
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => removeResult(result._id, result.studentName)}
                    aria-label={`Delete ${result.studentName}'s paper`}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-400 hover:bg-fail-50 hover:text-fail-600"
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>

                {result.pendingReview > 0 && openId !== result._id && (
                  <p className="flex items-center gap-1.5 px-4 pb-3 text-xs text-warn-600">
                    <TriangleAlert size={13} aria-hidden="true" />
                    {result.pendingReview} written answer
                    {result.pendingReview === 1 ? "" : "s"} still to type in
                  </p>
                )}

                {openId === result._id && (
                  <ResultReview
                    resultId={result._id}
                    onSaved={(updated) => {
                      setResults((previous) =>
                        previous.map((r) => (r._id === updated._id ? { ...r, ...updated } : r))
                      );
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

const STATUS_STYLES = {
  correct: "bg-pass-50 text-pass-700",
  partial: "bg-warn-50 text-warn-600",
  wrong: "bg-fail-50 text-fail-700",
  blank: "bg-ink-100 text-ink-600",
  ambiguous: "bg-warn-50 text-warn-600",
  "needs-review": "bg-brand-50 text-brand-700",
};

/** One paper, question by question, with the written answers editable. */
function ResultReview({ resultId, onSaved }) {
  const toast = useToast();
  const [result, setResult] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [name, setName] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    resultService
      .get(resultId)
      .then((data) => {
        if (!cancelled) setResult(data.result);
      })
      .catch((err) => toast.error(err.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultId]);

  async function save() {
    setSaving(true);
    try {
      const payload = { answers: drafts };
      if (name !== null && name.trim()) payload.studentName = name.trim();
      const response = await resultService.update(resultId, payload);
      setResult(response.data.result);
      setDrafts({});
      setName(null);
      onSaved(response.data.result);
      toast.success(response.message);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!result) return <div className="px-4 pb-4"><Spinner label="Loading paper" /></div>;

  const needsTyping = result.answers.filter(
    (a) => a.status === "needs-review" || a.status === "ambiguous"
  );

  return (
    <div className="border-t border-ink-100 bg-ink-50/40 px-4 py-4">
      {/* Papers scanned by camera are numbered rather than named, so the name
          is set here once the teacher can see whose paper it was. */}
      <div className="mb-3 flex items-center gap-2">
        <label className="text-xs text-ink-500" htmlFor={`name-${resultId}`}>
          Student
        </label>
        <input
          id={`name-${resultId}`}
          type="text"
          value={name ?? result.studentName}
          onChange={(e) => setName(e.target.value)}
          className="h-8 min-w-0 flex-1 rounded-md border border-ink-300 px-2.5 text-sm focus:border-brand-500 focus:outline-none"
        />
        {name !== null && name.trim() !== result.studentName && (
          <Button size="sm" loading={saving} onClick={save}>
            Rename
          </Button>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600">
        <span>{result.correctAnswers} correct</span>
        <span>{result.wrongAnswers} wrong</span>
        <span>{result.blankAnswers} blank</span>
        {result.ambiguousAnswers > 0 && (
          <span className="text-warn-600">{result.ambiguousAnswers} unclear</span>
        )}
        {result.pendingReview > 0 && (
          <span className="text-brand-700">{result.pendingReview} to type in</span>
        )}
      </div>

      {needsTyping.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            Could not be read — type in what the student wrote
          </p>
          {needsTyping.map((answer) => (
            <div key={answer.questionNumber} className="flex items-center gap-2">
              <span className="w-28 shrink-0 truncate text-xs text-ink-500">
                {answer.section ? `${shortSection(answer.section)} ` : ""}
                {answer.sectionNumber ?? answer.questionNumber}
              </span>
              {/* The strip of the paper itself, so the handwriting can be read
                  here instead of going back to the pile. */}
              {answer.writeInCrop && (
                <img
                  src={`/uploads/${answer.writeInCrop}`}
                  alt={`What the student wrote for item ${answer.sectionNumber ?? answer.questionNumber}`}
                  className="h-8 w-40 shrink-0 rounded border border-ink-200 bg-white object-contain"
                />
              )}
              <input
                type="text"
                value={drafts[answer.questionNumber] ?? answer.studentAnswer ?? ""}
                onChange={(e) =>
                  setDrafts({ ...drafts, [answer.questionNumber]: e.target.value })
                }
                placeholder={answer.status === "ambiguous" ? "unclear mark" : "student's answer"}
                className="h-9 min-w-0 flex-1 rounded-md border border-ink-300 px-2.5 text-sm focus:border-brand-500 focus:outline-none"
              />
              <span className="w-40 shrink-0 truncate text-xs text-ink-500" title={answer.correctAnswer}>
                key: {answer.correctAnswer}
              </span>
            </div>
          ))}
          <Button size="sm" loading={saving} onClick={save} disabled={Object.keys(drafts).length === 0}>
            <Check size={15} aria-hidden="true" />
            Save and regrade
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-ink-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-ink-50 uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-3 py-1.5 font-semibold">#</th>
              <th className="px-3 py-1.5 font-semibold">Answer</th>
              <th className="px-3 py-1.5 font-semibold">Key</th>
              <th className="px-3 py-1.5 font-semibold">Status</th>
              <th className="px-3 py-1.5 text-right font-semibold">Pts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {result.answers.map((answer) => (
              <tr key={answer.questionNumber}>
                <td className="px-3 py-1.5 text-ink-600">
                  {answer.section ? `${shortSection(answer.section)} ` : ""}
                  {answer.sectionNumber ?? answer.questionNumber}
                </td>
                <td className="px-3 py-1.5 font-medium text-ink-800">
                  {answer.studentAnswer || "—"}
                  {/* How sure the reader was. Written answers are graded on
                      what it read, so a low number is worth a second look. */}
                  {isWritten(answer.questionType) && answer.studentAnswer && (
                    <span
                      className={`ml-1.5 font-normal ${
                        answer.confidence < 0.5 ? "text-warn-600" : "text-ink-400"
                      }`}
                    >
                      read {Math.round(answer.confidence * 100)}%
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-ink-500">{answer.correctAnswer}</td>
                <td className="px-3 py-1.5">
                  <span
                    className={`rounded-sm px-1.5 py-0.5 font-medium ${
                      STATUS_STYLES[answer.status] ?? "bg-ink-100 text-ink-600"
                    }`}
                  >
                    {answer.status}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right text-ink-600">
                  {answer.pointsEarned}/{answer.pointsPossible}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** "TEST II: TRUE OR FALSE" -> "TEST II" so the number column stays narrow. */
function shortSection(section) {
  return section.split(":")[0].trim();
}

/** Types answered in the student's own handwriting rather than by a bubble. */
function isWritten(type) {
  return (
    type === "identification" || type === "fill-in-the-blanks" || type === "enumeration"
  );
}
