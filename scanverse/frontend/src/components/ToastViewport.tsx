import { AnimatePresence, motion } from "framer-motion";
import { useToast } from "@/context/ToastContext";

const VARIANT_STYLES: Record<string, string> = {
  success: "border-emerald-400/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  error: "border-red-400/40 bg-red-500/10 text-red-600 dark:text-red-300",
  info: "border-brand/30 bg-brand/10 text-brand",
};

function VariantIcon({ variant }: { variant: string }) {
  const common = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 };
  if (variant === "success") {
    return (
      <svg {...common}>
        <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (variant === "error") {
    return (
      <svg {...common}>
        <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
    </svg>
  );
}

export default function ToastViewport() {
  const { toasts, dismissToast } = useToast();

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:right-6 sm:left-auto">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl2 border px-4 py-3 shadow-soft backdrop-blur ${
              VARIANT_STYLES[toast.variant] || VARIANT_STYLES.info
            } bg-white/95 dark:bg-surface-dark/95`}
          >
            <span className="mt-0.5 shrink-0">
              <VariantIcon variant={toast.variant} />
            </span>
            <p className="flex-1 text-sm font-medium text-ink dark:text-paper">{toast.message}</p>
            <button
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
              className="shrink-0 text-ink/40 transition hover:text-ink/70 dark:text-paper/40 dark:hover:text-paper/70"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
