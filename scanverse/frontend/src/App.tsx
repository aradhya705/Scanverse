import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import ProtectedRoute from "@/components/ProtectedRoute";

// Route-level code splitting: every page is its own chunk, so the initial
// load ships only what the landing page needs and the rest streams in on
// navigation. See vite build output for the per-page chunk sizes.
const Landing = lazy(() => import("@/pages/Landing"));
const Login = lazy(() => import("@/pages/Login"));
const Register = lazy(() => import("@/pages/Register"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const DashboardLayout = lazy(() => import("@/pages/DashboardLayout"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const NewScan = lazy(() => import("@/pages/NewScan"));
const Documents = lazy(() => import("@/pages/Documents"));
const DocumentDetail = lazy(() => import("@/pages/DocumentDetail"));
const Settings = lazy(() => import("@/pages/Settings"));
const ImageTools = lazy(() => import("@/pages/ImageTools"));
const PdfTools = lazy(() => import("@/pages/PdfTools"));

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper dark:bg-ink">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-line-light border-t-brand" />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="new-scan" element={<NewScan />} />
            <Route path="documents" element={<Documents />} />
            <Route path="documents/:id" element={<DocumentDetail />} />
            <Route path="image-tools" element={<ImageTools />} />
            <Route path="pdf-tools" element={<PdfTools />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Route>

        <Route path="*" element={<Landing />} />
      </Routes>
    </Suspense>
  );
}
