import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, Trash2, UserRound } from "lucide-react";
import Button from "../components/Button.jsx";
import Input from "../components/Input.jsx";
import Modal from "../components/Modal.jsx";
import Select from "../components/Select.jsx";
import StatCard from "../components/StatCard.jsx";
import { EmptyState, ErrorState, Spinner } from "../components/States.jsx";
import { userService } from "../services/userService.js";
import { useAuth } from "../hooks/useAuth.js";
import { useToast } from "../hooks/useToast.js";
import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import { formatDate, initials } from "../utils/format.js";

/**
 * The account roster.
 *
 * Admin-only, and the server enforces that — this page never has to decide who
 * may see it. What it does decide is how much damage is reachable by accident:
 * suspending is offered first and delete is refused while an account still owns
 * work, so a tidy-up cannot quietly orphan a class's marks.
 */
export default function Users() {
  const { user: me } = useAuth();
  const toast = useToast();

  const [state, setState] = useState({ loading: true, error: null, users: [], totals: null });
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const q = useDebouncedValue(search, 350);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await userService.list({ q, role });
      setState({ loading: false, error: null, users: data.users, totals: data.totals });
    } catch (error) {
      setState({ loading: false, error: error.message, users: [], totals: null });
    }
  }, [q, role]);

  useEffect(() => {
    load();
  }, [load]);

  async function change(user, payload, success) {
    setBusyId(user._id);
    try {
      await userService.update(user._id, payload);
      toast.success(success);
      await load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    const user = pendingDelete;
    setBusyId(user._id);
    try {
      const { message } = await userService.remove(user._id);
      toast.success(message);
      setPendingDelete(null);
      await load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusyId(null);
    }
  }

  const { loading, error, users, totals } = state;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-ink-900">Accounts</h2>
        <p className="mt-1 text-sm text-ink-500">
          Every teacher and administrator on this CheckWise installation.
        </p>
      </div>

      {totals && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
          <StatCard icon={UserRound} label="All accounts" value={totals.all} />
          <StatCard icon={UserRound} label="Teachers" value={totals.teachers} tone="emerald" />
          <StatCard icon={ShieldCheck} label="Administrators" value={totals.admins} tone="amber" />
        </div>
      )}

      <div className="card">
        <div className="flex flex-col gap-3 border-b border-ink-200 p-4 sm:flex-row">
          <Input
            className="flex-1"
            placeholder="Search by name or email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select
            className="sm:w-48"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            options={[
              { value: "all", label: "All roles" },
              { value: "teacher", label: "Teachers" },
              { value: "admin", label: "Administrators" },
            ]}
          />
        </div>

        {loading ? (
          <Spinner label="Loading accounts" />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : users.length === 0 ? (
          <EmptyState
            icon={UserRound}
            title="No accounts match"
            description="Try a different search or role filter."
          />
        ) : (
          <ul className="ruled">
            {users.map((user) => (
              <UserRow
                key={user._id}
                user={user}
                isMe={user._id === me?._id}
                busy={busyId === user._id}
                onChange={change}
                onDelete={() => setPendingDelete(user)}
              />
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title={`Delete ${pendingDelete?.name}?`}
        description="The account is removed permanently. This cannot be undone."
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busyId === pendingDelete?._id} onClick={confirmDelete}>
              Delete account
            </Button>
          </>
        }
      />
    </div>
  );
}

function UserRow({ user, isMe, busy, onChange, onDelete }) {
  const isAdmin = user.role === "admin";
  const owns = user.examCount > 0 || user.resultCount > 0;

  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold ${
          isAdmin ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-600"
        }`}
      >
        {initials(user.name)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-semibold text-ink-900">{user.name}</p>
          {isMe && (
            <span className="rounded-sm bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700">
              You
            </span>
          )}
          {!user.isActive && (
            <span className="rounded-sm bg-fail-50 px-1.5 py-0.5 text-[11px] font-semibold text-fail-700">
              Suspended
            </span>
          )}
        </div>
        <p className="truncate text-sm text-ink-500">{user.email}</p>
        <p className="mt-1 text-xs text-ink-400">
          {user.examCount} exam{user.examCount === 1 ? "" : "s"} · {user.resultCount} paper
          {user.resultCount === 1 ? "" : "s"} · joined {formatDate(user.createdAt)}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Select
          aria-label={`Role for ${user.name}`}
          className="w-36"
          value={user.role}
          disabled={busy}
          onChange={(event) =>
            onChange(user, { role: event.target.value }, `${user.name} is now a ${event.target.value}.`)
          }
          options={[
            { value: "teacher", label: "Teacher" },
            { value: "admin", label: "Administrator" },
          ]}
        />

        <Button
          size="sm"
          variant="secondary"
          disabled={busy || isMe}
          title={isMe ? "You cannot suspend your own account" : undefined}
          onClick={() =>
            onChange(
              user,
              { isActive: !user.isActive },
              user.isActive ? `${user.name} was suspended.` : `${user.name} was restored.`
            )
          }
        >
          {user.isActive ? "Suspend" : "Restore"}
        </Button>

        <Button
          size="sm"
          variant="ghost"
          className="text-fail-600 hover:bg-fail-50"
          disabled={busy || isMe || owns}
          title={
            isMe
              ? "You cannot delete your own account"
              : owns
                ? "This account still owns exams or scanned papers"
                : undefined
          }
          onClick={onDelete}
        >
          <Trash2 size={15} aria-hidden="true" />
          <span className="sr-only">Delete {user.name}</span>
        </Button>
      </div>
    </li>
  );
}
