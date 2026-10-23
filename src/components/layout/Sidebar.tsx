import { useEffect } from "react";
import { NavLink } from "react-router-dom";
import { ChevronsLeft, Leaf, X } from "lucide-react";
import { NAV_GROUPS } from "./navItems";
import { cn } from "@/lib/utils";

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  // Escape closes the mobile drawer, matching the expected dialog behaviour.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseMobile();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, onCloseMobile]);

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onCloseMobile}
          className="fixed inset-0 z-30 animate-fade-in bg-black/60 backdrop-blur-[2px] lg:hidden"
        />
      ) : null}

      <aside
        aria-label="Navigation panel"
        className={cn(
          // `visibility` is transitioned so the drawer still slides out before it becomes
          // unfocusable, while closed links stay out of the tab order on small screens.
          "fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-line bg-surface transition-[transform,width,visibility] duration-200 ease-out lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          mobileOpen ? "translate-x-0 visible" : "-translate-x-full invisible lg:visible",
          collapsed && "lg:w-[72px]",
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/12 text-brand ring-1 ring-brand/25">
            <Leaf size={17} />
          </span>
          <div className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>
            <p className="truncate text-sm font-semibold leading-tight text-ink">EcoPilot AI</p>
            <p className="truncate text-2xs leading-tight text-faint">
              Sustainability intelligence
            </p>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation"
            className="text-faint transition-colors hover:text-ink lg:hidden"
          >
            <X size={16} />
          </button>
        </div>

        <nav aria-label="Primary" className="flex-1 overflow-y-auto px-2.5 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-5 last:mb-0">
              <p
                className={cn(
                  "label-micro mb-2 px-2.5",
                  collapsed && "lg:px-0 lg:text-center lg:text-[9px] lg:tracking-normal",
                )}
              >
                {collapsed ? (
                  <>
                    <span className="lg:hidden">{group.label}</span>
                    <span className="hidden lg:inline" aria-hidden>
                      ···
                    </span>
                  </>
                ) : (
                  group.label
                )}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={onCloseMobile}
                      title={collapsed ? `${item.label} — ${item.description}` : item.description}
                      className={({ isActive }) =>
                        cn(
                          "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                          collapsed && "lg:justify-center lg:px-0",
                          isActive
                            ? "bg-brand/10 font-semibold text-brand-300"
                            : "text-muted hover:bg-line/40 hover:text-ink",
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <span
                            className={cn(
                              "absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-brand transition-opacity",
                              isActive ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <item.icon size={17} className="shrink-0" />
                          <span className={cn("truncate", collapsed && "lg:hidden")}>
                            {item.label}
                          </span>
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-line p-2.5">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!collapsed}
            className={cn(
              "hidden w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-faint transition-colors hover:bg-line/40 hover:text-ink lg:flex",
              collapsed && "justify-center px-0",
            )}
          >
            <ChevronsLeft
              size={15}
              aria-hidden
              className={cn("transition-transform duration-200", collapsed && "rotate-180")}
            />
            <span aria-hidden className={cn(collapsed && "hidden")}>Collapse</span>
          </button>
          <p
            className={cn(
              "px-2.5 pt-1 text-2xs leading-relaxed text-faint/80",
              collapsed && "lg:hidden",
            )}
          >
            Bounded agent · no shell access
          </p>
        </div>
      </aside>
    </>
  );
}
