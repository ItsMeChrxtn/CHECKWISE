import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, Menu, Settings } from "lucide-react";
import Button from "./Button.jsx";
import Modal from "./Modal.jsx";
import { useAuth } from "../hooks/useAuth.js";
import { useToast } from "../hooks/useToast.js";
import { initials } from "../utils/format.js";

export default function Topbar({ onMenuClick, title }) {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onClickAway = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, [menuOpen]);

  async function handleLogout() {
    setSigningOut(true);
    try {
      await logout();
      toast.success("You have been signed out.");
      navigate("/login", { replace: true });
    } finally {
      setSigningOut(false);
      setConfirmOpen(false);
    }
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-ink-200 bg-white/90 px-4 backdrop-blur sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open navigation"
        className="rounded-md p-2 text-ink-600 hover:bg-ink-100 lg:hidden"
      >
        <Menu size={20} />
      </button>

      <h1 className="flex-1 truncate text-lg font-semibold text-ink-900 sm:text-xl">{title}</h1>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-ink-100"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-brand-700 text-[13px] font-semibold text-white">
            {initials(user?.name)}
          </span>
          <span className="hidden text-left sm:block">
            <span className="block max-w-[10rem] truncate text-sm font-medium text-ink-800">
              {user?.name}
            </span>
            <span className="block text-xs capitalize text-ink-500">{user?.role}</span>
          </span>
          <ChevronDown size={16} className="hidden text-ink-400 sm:block" aria-hidden="true" />
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="overlay absolute right-0 mt-2 w-56 overflow-hidden rounded-md border border-ink-200 bg-white py-1"
          >
            <div className="border-b border-ink-100 px-3 py-2">
              <p className="truncate text-sm font-medium text-ink-800">{user?.name}</p>
              <p className="truncate text-xs text-ink-500">{user?.email}</p>
            </div>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                navigate("/settings");
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-ink-50"
            >
              <Settings size={16} aria-hidden="true" />
              Settings
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setConfirmOpen(true);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-fail-600 hover:bg-fail-50"
            >
              <LogOut size={16} aria-hidden="true" />
              Sign out
            </button>
          </div>
        )}
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Sign out of CheckWise?"
        description="You will need to sign in again to access your exams and results."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={signingOut} onClick={handleLogout}>
              Sign out
            </Button>
          </>
        }
      />
    </header>
  );
}
