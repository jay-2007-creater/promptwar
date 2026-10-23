import { Suspense, lazy } from "react";
import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Skeleton } from "@/components/ui/Feedback";

/**
 * Routes are code-split so the charting library (recharts) is only downloaded
 * by the workspaces that actually render charts, instead of on first paint.
 */
const Overview = lazy(() => import("@/pages/Overview"));
const Analysis = lazy(() => import("@/pages/Analysis"));
const Agent = lazy(() => import("@/pages/Agent"));
const Plans = lazy(() => import("@/pages/Plans"));
const Simulator = lazy(() => import("@/pages/Simulator"));
const Performance = lazy(() => import("@/pages/Performance"));
const Security = lazy(() => import("@/pages/Security"));
const Settings = lazy(() => import("@/pages/Settings"));
const NotFound = lazy(() => import("@/pages/NotFound"));

/** Announced to assistive technology while a route chunk is being fetched. */
function RouteFallback() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading workspace" className="space-y-4">
      <span className="sr-only">Loading workspace…</span>
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route
            path="/overview"
            element={
              <Suspense fallback={<RouteFallback />}>
                <Overview />
              </Suspense>
            }
          />
          <Route
            path="/analysis"
            element={
              <Suspense fallback={<RouteFallback />}>
                <Analysis />
              </Suspense>
            }
          />
          <Route
            path="/agent"
            element={
              <Suspense fallback={<RouteFallback />}>
                <Agent />
              </Suspense>
            }
          />
          <Route
            path="/plans"
            element={
              <Suspense fallback={<RouteFallback />}>
                <Plans />
              </Suspense>
            }
          />
          <Route
            path="/simulator"
            element={
              <Suspense fallback={<RouteFallback />}>
                <Simulator />
              </Suspense>
            }
          />
          <Route
            path="/performance"
            element={
              <Suspense fallback={<RouteFallback />}>
                <Performance />
              </Suspense>
            }
          />
          <Route
            path="/security"
            element={
              <Suspense fallback={<RouteFallback />}>
                <Security />
              </Suspense>
            }
          />
          <Route
            path="/settings"
            element={
              <Suspense fallback={<RouteFallback />}>
                <Settings />
              </Suspense>
            }
          />
          <Route
            path="*"
            element={
              <Suspense fallback={<RouteFallback />}>
                <NotFound />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </Router>
  );
}
