import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import { Spinner } from "./States.jsx";

/**
 * Gate for authenticated areas. Pass `roles` to additionally restrict by role;
 * this mirrors the server's roleMiddleware, which remains the real enforcement.
 */
export default function ProtectedRoute({ roles }) {
  const { isAuthenticated, initialising, user } = useAuth();
  const location = useLocation();

  if (initialising) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner label="Restoring your session" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // Remember where they were headed so login can send them back.
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

/** Keeps signed-in users away from the login/register screens. */
export function PublicOnlyRoute() {
  const { isAuthenticated, initialising } = useAuth();

  if (initialising) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner label="Loading CheckWise" />
      </div>
    );
  }

  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <Outlet />;
}
