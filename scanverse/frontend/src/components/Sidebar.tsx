import { NavLink } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";
import { useAuth } from "@/context/AuthContext";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: "grid" },
  { to: "/dashboard/new-scan", label: "New Scan", icon: "scan" },
  { to: "/dashboard/documents", label: "Documents", icon: "file" },
  { to: "/dashboard/documents?favorites=1", label: "Favorites", icon: "star" },
  { to: "/dashboard/image-tools", label: "Image Tools", icon: "image" },
  { to: "/dashboard/pdf-tools", label: "PDF Tools", icon: "filetext" },
  { to: "/dashboard/settings", label: "Settings", icon: "gear" },
];

function Icon({ name }: { name: string }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8 };
  switch (name) {
    case "grid":
      return <svg {...common}><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg>;
    case "scan":
      return <svg {...common}><path d="M4 8V6a2 2 0 0 1 2-2h2M20 8V6a2 2 0 0 0-2-2h-2M4 16v2a2 2 0 0 0 2 2h2M20 16v2a2 2 0 0 1-2 2h-2" strokeLinecap="round"/><line x1="4" y1="12" x2="20" y2="12" stroke="#9D4EDD"/></svg>;
    case "file":
      return <svg {...common}><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M15 2v5h5"/></svg>;
    case "star":
      return <svg {...common}><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z"/></svg>;
    case "image":
      return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>;
    case "filetext":
      return <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>;
    case "gear":
      return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>;
    default:
      return null;
  }
}

interface SidebarContentProps {
  onNavigate?: () => void;
}

function SidebarContent({ onNavigate }: SidebarContentProps) {
  const { user, logout } = useAuth();

  return (
    <>
      <div className="flex items-center gap-2 px-6 py-6">
        <Logo size={28} className="text-ink dark:text-paper" />
        <span className="font-display text-lg font-semibold tracking-tight">ScanVerse</span>
        <ThemeToggle className="ml-auto" />
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.label}
            to={item.to}
            end={item.to === "/dashboard"}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? "bg-brand/10 text-brand"
                  : "text-ink/70 hover:bg-black/5 dark:text-paper/70 dark:hover:bg-white/5"
              }`
            }
          >
            <Icon name={item.icon} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-line-light px-4 py-4 dark:border-line-dark">
        <div className="mb-3 flex items-center gap-3 px-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10 font-display text-sm font-semibold text-brand">
            {(user?.full_name || user?.email || "?").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user?.full_name || "Your account"}</p>
            <p className="truncate text-xs text-ink/50 dark:text-paper/50">{user?.email}</p>
          </div>
        </div>
        <button onClick={logout} className="btn-secondary w-full text-xs">
          Sign out
        </button>
      </div>
    </>
  );
}

/** Desktop: a fixed, always-visible rail. Mobile/tablet (<lg): hidden by
 * default behind a hamburger button rendered by DashboardLayout, sliding in
 * as an overlay drawer so narrow screens aren't permanently losing ~256px of
 * width to navigation. */
export default function Sidebar() {
  return (
    <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-line-light bg-white/70 backdrop-blur dark:border-line-dark dark:bg-ink/60 lg:flex">
      <SidebarContent />
    </aside>
  );
}

interface MobileSidebarProps {
  open: boolean;
  onClose: () => void;
}

export function MobileSidebarDrawer({ open, onClose }: MobileSidebarProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            aria-hidden="true"
          />
          <motion.aside
            key="drawer"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "tween", duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-white shadow-soft dark:bg-ink lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            <SidebarContent onNavigate={onClose} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
