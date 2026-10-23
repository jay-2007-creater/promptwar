import { useNavigate, useLocation } from "react-router-dom";
import { Compass, LayoutDashboard } from "lucide-react";
import { NAV_GROUPS } from "@/components/layout/navItems";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function NotFound() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <Card className="card-pad">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-brand">
            <Compass size={22} />
          </span>
          <div className="min-w-0">
            <p className="label-micro mb-1.5">404</p>
            <h1 className="text-xl font-semibold text-ink md:text-2xl">This page does not exist</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              No route matches{" "}
              <span className="font-mono text-xs text-amber-300">{location.pathname}</span>. It may
              have been removed, or the link may be mistyped. Nothing in your workspace was affected.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button icon={<LayoutDashboard size={14} />} onClick={() => navigate("/overview")}>
                Go to Overview
              </Button>
              <Button variant="ghost" onClick={() => navigate(-1)}>
                Go back
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="card-pad">
          <p className="label-micro mb-2">Available sections</p>
          <div className="grid gap-4 sm:grid-cols-3">
            {NAV_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="mb-1.5 text-2xs font-semibold uppercase tracking-[0.09em] text-faint">
                  {group.label}
                </p>
                <ul className="space-y-1">
                  {group.items.map((item) => (
                    <li key={item.to}>
                      <button
                        type="button"
                        onClick={() => navigate(item.to)}
                        className="text-left text-sm text-muted transition-colors hover:text-brand-300"
                      >
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
