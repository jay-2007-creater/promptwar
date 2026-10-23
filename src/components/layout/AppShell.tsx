import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { TOP_BAR_TITLES } from "./navItems";
import { useApplyTheme } from "@/hooks/useTheme";

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  useApplyTheme();
  const page = TOP_BAR_TITLES[location.pathname];

  return (
    <div className="relative flex min-h-screen bg-bg">
      {/* SPA route changes do not reload the document, so announce the new page explicitly. */}
      <p aria-live="polite" className="sr-only">
        {page ? `${page.label}. ${page.description}` : ""}
      </p>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:border focus:border-brand/50 focus:bg-elevated focus:px-3.5 focus:py-2 focus:text-sm focus:font-medium focus:text-ink"
      >
        Skip to main content
      </a>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-[420px] opacity-[0.5]"
        style={{
          background:
            "radial-gradient(900px 320px at 18% -8%, rgba(16,185,129,0.10), transparent 62%), radial-gradient(700px 300px at 88% -14%, rgba(110,231,183,0.05), transparent 60%)",
        }}
      />
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <TopBar onOpenNav={() => setMobileOpen(true)} />
        <main
          id="main-content"
          tabIndex={-1}
          key={location.pathname}
          className="flex-1 animate-fade-in px-4 py-5 md:px-6 md:py-6"
        >
          <div className="mx-auto w-full max-w-[1500px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
