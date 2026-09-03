import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import { ToastProvider } from "./context/ToastContext.jsx";
import InstallHint from "./components/InstallHint.jsx";
import Toaster from "./components/Toaster.jsx";
import ProtectedRoute, { PublicOnlyRoute } from "./components/ProtectedRoute.jsx";
import AuthLayout from "./layouts/AuthLayout.jsx";
import DashboardLayout from "./layouts/DashboardLayout.jsx";
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Exams from "./pages/Exams.jsx";
import ExamForm from "./pages/ExamForm.jsx";
import ExamDetails from "./pages/ExamDetails.jsx";
import Results from "./pages/Results.jsx";
import Settings from "./pages/Settings.jsx";
import Users from "./pages/Users.jsx";
import NotFound from "./pages/NotFound.jsx";
import PhasePlaceholder from "./pages/PhasePlaceholder.jsx";

/**
 * Routes whose feature is scheduled for a later phase still resolve to a real
 * page describing what will live there - no dead links in the sidebar.
 * Phase numbers follow the project's eight-phase plan.
 */
const UPCOMING = [
  {
    path: "/answer-sheets",
    title: "Answer Sheets",
    phase: 5,
    description: "Generate and download printable answer sheets from the confirmed answer key.",
    bullets: [
      "Sections generated dynamically for whichever question types the key contains",
      "OMR bubbles for multiple choice, true or false and modified true or false",
      "Writing lines for identification, fill in the blanks and enumeration",
      "Corner alignment markers and a QR code carrying the exam code",
    ],
  },
  {
    path: "/scanner",
    title: "OMR Scanner",
    phase: 6,
    description: "Scan completed answer sheets and check them automatically.",
    bullets: [
      "Upload an image or capture with the device camera",
      "Marker detection and perspective correction",
      "Bubble analysis with a confidence score per question",
      "Written answers routed through OCR with manual review for low confidence",
    ],
  },
  {
    path: "/reports",
    title: "Reports",
    phase: 8,
    description: "Performance reporting and export.",
    bullets: ["Score distribution and pass rates", "Per-student performance", "CSV and Excel export"],
  },
];

const router = createBrowserRouter([
  // The public front door. Outside both guards on purpose: a signed-out visitor
  // must be able to read it, and a signed-in one should not be bounced off it —
  // the page swaps its own calls to action instead.
  { path: "/", element: <Landing /> },
  {
    element: <PublicOnlyRoute />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: "/login", element: <Login /> },
          { path: "/register", element: <Register /> },
        ],
      },
    ],
  },
  // Admin-only area. The server enforces this too; the guard here just avoids
  // showing a teacher a page that would only answer 403.
  {
    element: <ProtectedRoute roles={["admin"]} />,
    children: [
      {
        element: <DashboardLayout />,
        children: [
          { path: "/admin/users", element: <Users />, handle: { title: "Accounts" } },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <DashboardLayout />,
        children: [
          { path: "/dashboard", element: <Dashboard />, handle: { title: "Dashboard" } },

          { path: "/exams", element: <Exams />, handle: { title: "Exams" } },
          { path: "/exams/new", element: <ExamForm />, handle: { title: "Create Exam" } },
          { path: "/exams/:id", element: <ExamDetails />, handle: { title: "Exam Details" } },
          { path: "/exams/:id/edit", element: <ExamForm />, handle: { title: "Edit Exam" } },

          { path: "/results", element: <Results />, handle: { title: "Results" } },

          { path: "/settings", element: <Settings />, handle: { title: "Settings" } },

          ...UPCOMING.map(({ path, title, phase, description, bullets }) => ({
            path,
            handle: { title },
            element: (
              <PhasePlaceholder
                title={title}
                phase={phase}
                description={description}
                bullets={bullets}
              />
            ),
          })),
        ],
      },
    ],
  },
  { path: "*", element: <NotFound /> },
]);

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <RouterProvider router={router} />
        <Toaster />
        <InstallHint />
      </AuthProvider>
    </ToastProvider>
  );
}
