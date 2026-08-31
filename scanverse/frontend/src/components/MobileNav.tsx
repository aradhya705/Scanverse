import { NavLink } from "react-router-dom";

const ITEMS = [
  { to: "/dashboard", label: "Home", icon: "grid", end: true },
  { to: "/dashboard/documents", label: "Documents", icon: "file", end: false },
  { to: "/dashboard/image-tools", label: "Tools", icon: "image", end: false },
  { to: "/dashboard/settings", label: "Settings", icon: "gear", end: false },
] as const;

function Icon({ name }: { name: string }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8 };
  switch (name) {
    case "grid":
      return <svg {...common}><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg>;
    case "file":
      return <svg {...common}><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M15 2v5h5"/></svg>;
    case "image":
      return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>;
    case "gear":
      return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>;
    default:
      return null;
  }
}

/** Bottom tab bar for phones/tablets: four destinations plus a raised
 * center action button that jumps straight into a new scan. Hidden on
 * screens wide enough for the real sidebar (lg+). */
export default function MobileNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line-light/80 bg-white/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl dark:border-line-dark dark:bg-ink/85 lg:hidden">
      <div className="relative mx-auto grid max-w-lg grid-cols-4 items-center px-2">
        {ITEMS.slice(0, 2).map((item) => (
          <NavLink
            key={item.label}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition ${
                isActive ? "text-brand" : "text-ink/50 hover:text-ink/80 dark:text-paper/50 dark:hover:text-paper/80"
              }`
            }
          >
            <Icon name={item.icon} />
            {item.label}
          </NavLink>
        ))}

        {/* Center FAB */}
        <div className="flex justify-center">
          <NavLink
            to="/dashboard/new-scan"
            aria-label="New scan"
            className="-mt-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-deep via-brand to-brand-soft text-white shadow-glow transition active:scale-95"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </NavLink>
        </div>

        {ITEMS.slice(2).map((item) => (
          <NavLink
            key={item.label}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition ${
                isActive ? "text-brand" : "text-ink/50 hover:text-ink/80 dark:text-paper/50 dark:hover:text-paper/80"
              }`
            }
          >
            <Icon name={item.icon} />
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
