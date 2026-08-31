import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import Sidebar, { MobileSidebarDrawer } from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import ThemeToggle from "@/components/ThemeToggle";
import Logo from "@/components/Logo";

function MobileTopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <header className="flex items-center justify-between gap-2 border-b border-line-light bg-white/80 px-4 py-3 backdrop-blur dark:border-line-dark dark:bg-ink/70 lg:hidden">
      <div className="flex items-center gap-2">
        <Logo size={22} className="text-ink dark:text-paper" />
        <span className="font-display text-base font-semibold tracking-tight">ScanVerse</span>
      </div>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <button
          onClick={onOpenMenu}
          aria-label="Open navigation menu"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink/70 transition hover:bg-black/5 dark:text-paper/70 dark:hover:bg-white/5"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </header>
  );
}

export default function DashboardLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="flex min-h-screen bg-paper dark:bg-ink lg:h-screen lg:overflow-hidden">
      <Sidebar />
      <MobileSidebarDrawer open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar onOpenMenu={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto pb-20 lg:pb-0">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 md:px-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname + location.search}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
        <MobileNav />
      </div>
    </div>
  );
}
