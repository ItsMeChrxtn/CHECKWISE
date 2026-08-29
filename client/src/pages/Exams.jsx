import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ClipboardList, Eye, FilePlus2, Pencil, Search, Trash2 } from "lucide-react";
import Button from "../components/Button.jsx";
import Input from "../components/Input.jsx";
import Select from "../components/Select.jsx";
import Modal from "../components/Modal.jsx";
import Pagination from "../components/Pagination.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { EmptyState, ErrorState, Spinner } from "../components/States.jsx";
import { examService } from "../services/examService.js";
import { useAuth } from "../hooks/useAuth.js";
import { useToast } from "../hooks/useToast.js";
import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import { formatDate } from "../utils/format.js";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "needs-review", label: "Needs review" },
  { value: "ready", label: "Ready" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "title", label: "Title A-Z" },
  { value: "subject", label: "Subject A-Z" },
];

const LIMIT = 10;

export default function Exams() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const debouncedSearch = useDebouncedValue(search);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await examService.list({ q: debouncedSearch, status, sort, page, limit: LIMIT }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, status, sort, page]);

  useEffect(() => {
    load();
  }, [load]);

  // A new query must restart at page 1, or the user can land on a page that no
  // longer exists for the narrowed result set.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, sort]);

  async function confirmDelete() {
    setDeleting(true);
    try {
      const response = await examService.remove(pendingDelete._id);
      toast.success(response.message);
      setPendingDelete(null);

      // Deleting the last row of a page would otherwise strand the user on an
      // empty page, so step back instead.
      const wasLastOnPage = data.exams.length === 1 && page > 1;
      if (wasLastOnPage) setPage((current) => current - 1);
      else load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  }

  const exams = data?.exams ?? [];
  const isFiltered = Boolean(debouncedSearch) || status !== "all";

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-ink-900">
            {isAdmin ? "All exams" : "Your exams"}
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Create an exam, then upload its answer key to build the answer sheet.
          </p>
        </div>

        <Link to="/exams/new" className="shrink-0">
          <Button>
            <FilePlus2 size={17} aria-hidden="true" />
            Create exam
          </Button>
        </Link>
      </header>

      <div className="card">
        <div className="grid grid-cols-1 gap-3 border-b border-ink-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2">
            <Search
              size={17}
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-ink-400"
            />
            <Input
              type="search"
              aria-label="Search exams"
              placeholder="Search by title, subject or exam code"
              className="[&_input]:pl-10"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <Select
            aria-label="Filter by status"
            options={STATUS_OPTIONS}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          />

          <Select
            aria-label="Sort exams"
            options={SORT_OPTIONS}
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          />
        </div>

        {loading && !data ? (
          <Spinner label="Loading exams" />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : exams.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={isFiltered ? "No exams match those filters" : "No exams yet"}
            description={
              isFiltered
                ? "Try a different search term, or clear the status filter."
                : "Create your first exam to get started."
            }
            action={
              isFiltered ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setStatus("all");
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Link to="/exams/new">
                  <Button size="sm">
                    <FilePlus2 size={16} aria-hidden="true" />
                    Create exam
                  </Button>
                </Link>
              )
            }
          />
        ) : (
          <>
            {/* Table layout on wide screens */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-ink-200 text-xs uppercase tracking-wide text-ink-500">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Exam
                    </th>
                    {isAdmin && (
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Teacher
                      </th>
                    )}
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Exam code
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Questions
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Created
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {exams.map((exam) => (
                    <tr key={exam._id} className="hover:bg-ink-50/60">
                      <td className="px-4 py-3">
                        <Link
                          to={`/exams/${exam._id}`}
                          className="font-medium text-ink-800 hover:text-brand-700"
                        >
                          {exam.title}
                        </Link>
                        <p className="text-xs text-ink-500">{exam.subject}</p>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-ink-600">{exam.teacherId?.name || "—"}</td>
                      )}
                      <td className="px-4 py-3 font-mono text-xs text-brand-700">
                        {exam.examCode}
                      </td>
                      <td className="px-4 py-3 text-ink-600">
                        {exam.totalQuestions > 0 ? (
                          <>
                            {exam.totalQuestions}
                            <span className="text-ink-400"> · {exam.totalPoints} pts</span>
                          </>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={exam.status} />
                      </td>
                      <td className="px-4 py-3 text-ink-500">{formatDate(exam.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <RowAction
                            label="View exam"
                            icon={Eye}
                            onClick={() => navigate(`/exams/${exam._id}`)}
                          />
                          <RowAction
                            label="Edit exam"
                            icon={Pencil}
                            onClick={() => navigate(`/exams/${exam._id}/edit`)}
                          />
                          <RowAction
                            label="Delete exam"
                            icon={Trash2}
                            danger
                            onClick={() => setPendingDelete(exam)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Card layout on small screens */}
            <ul className="divide-y divide-ink-100 lg:hidden">
              {exams.map((exam) => (
                <li key={exam._id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to={`/exams/${exam._id}`}
                        className="block truncate font-medium text-ink-800"
                      >
                        {exam.title}
                      </Link>
                      <p className="truncate text-xs text-ink-500">{exam.subject}</p>
                      <p className="mt-1 font-mono text-xs text-brand-700">{exam.examCode}</p>
                    </div>
                    <StatusBadge status={exam.status} className="shrink-0" />
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="text-xs text-ink-500">
                      {exam.totalQuestions > 0
                        ? `${exam.totalQuestions} questions · ${exam.totalPoints} pts`
                        : "No questions yet"}
                      {" · "}
                      {formatDate(exam.createdAt)}
                    </p>
                    <div className="flex items-center gap-1">
                      <RowAction
                        label="View exam"
                        icon={Eye}
                        onClick={() => navigate(`/exams/${exam._id}`)}
                      />
                      <RowAction
                        label="Edit exam"
                        icon={Pencil}
                        onClick={() => navigate(`/exams/${exam._id}/edit`)}
                      />
                      <RowAction
                        label="Delete exam"
                        icon={Trash2}
                        danger
                        onClick={() => setPendingDelete(exam)}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <Pagination pagination={data.pagination} onPageChange={setPage} />
          </>
        )}
      </div>

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => !deleting && setPendingDelete(null)}
        title="Delete this exam?"
        description={
          pendingDelete
            ? `"${pendingDelete.title}" will be permanently removed, along with every result recorded against it. This cannot be undone.`
            : ""
        }
        footer={
          <>
            <Button variant="secondary" disabled={deleting} onClick={() => setPendingDelete(null)}>
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

function RowAction({ label, icon: Icon, onClick, danger = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={
        danger
          ? "grid h-8 w-8 place-items-center rounded-md text-ink-500 hover:bg-fail-50 hover:text-fail-600"
          : "grid h-8 w-8 place-items-center rounded-md text-ink-500 hover:bg-ink-100 hover:text-ink-700"
      }
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}
