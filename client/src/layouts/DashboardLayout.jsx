import { useEffect, useState } from "react";
import { Outlet, useLocation, useMatches } from "react-router-dom";
import Sidebar from "../components/Sidebar.jsx";
import Topbar from "../components/Topbar.jsx";
import { useAuth } from "../hooks/useAuth.js";

export default function DashboardLayout() {
  const { isAdmin } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const matches = useMatches();

  // Page title comes from the route definition, keeping it beside the route.
  const title = [...matches].reverse().find((m) => m.handle?.title)?.handle.title ?? "CheckWise";

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} isAdmin={isAdmin} />

      <div className="lg:pl-64">
        <Topbar onMenuClick={() => setSidebarOpen(true)} title={title} />
        <main className="p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
