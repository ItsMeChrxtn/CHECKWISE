import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import Button from "../components/Button.jsx";
import Logo from "../components/Logo.jsx";
import { useAuth } from "../hooks/useAuth.js";

export default function NotFound() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="grid min-h-screen place-items-center px-5">
      <div className="w-full max-w-md text-center">
        <Logo size="md" className="mb-8 justify-center" />

        <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-sm border border-ink-200 bg-ink-50 text-ink-500">
          <Compass size={24} aria-hidden="true" />
        </span>

        <p className="text-sm font-semibold uppercase tracking-wide text-ink-500">Error 404</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900">Page not found</h1>
        <p className="mt-2 text-sm text-ink-500">
          The page you are looking for does not exist or has been moved.
        </p>

        <Link to={isAuthenticated ? "/dashboard" : "/login"} className="mt-6 inline-block">
          <Button>{isAuthenticated ? "Back to dashboard" : "Go to sign in"}</Button>
        </Link>
      </div>
    </div>
  );
}
