import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/layout/AppShell";
import AdminRoute from "./routes/AdminRoute";
import ProtectedRoute from "./routes/ProtectedRoute";
import HomePage from "./pages/HomePage";
import NotFoundPage from "./pages/NotFoundPage";
const AdminPage = lazy(() => import("./pages/AdminPage"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const ElectionListPage = lazy(() => import("./pages/ElectionListPage"));
const ResultsPage = lazy(() => import("./pages/ResultsPage"));
const VotingPage = lazy(() => import("./pages/VotingPage"));
const ChainPage = lazy(() => import("./pages/ChainPage"));
const HelpPage = lazy(() => import("./pages/HelpPage"));

function App() {
  return (
    <AppShell>
      <Suspense fallback={<div className="page-shell" role="status">Loading page…</div>}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/elections" element={<ElectionListPage />} />
        <Route path="/chain" element={<ChainPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/results/:electionId" element={<ResultsPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/elections/:electionId"
          element={
            <ProtectedRoute>
              <VotingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminPage />
            </AdminRoute>
          }
        />
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </Suspense>
    </AppShell>
  );
}

export default App;
