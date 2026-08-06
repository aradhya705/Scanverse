import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchStats, listDocuments } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { motion } from "framer-motion";

const STORAGE_QUOTA_BYTES = 500 * 1024 * 1024; // display scale: 500 MB free tier

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-black/5 dark:bg-white/5 ${className}`} />;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data: documents, isLoading: docsLoading } = useQuery({
    queryKey: ["documents", "recent"],
    queryFn: () => listDocuments(),
  });
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["stats"],
    queryFn: fetchStats,
  });

  const recent = (documents ?? []).slice(0, 5);
  const totalPages = stats?.page_count ?? (documents ?? []).reduce((sum, d) => sum + d.page_count, 0);
  const storageUsed = stats?.total_storage_bytes ?? 0;
  const storagePct = Math.min(100, (storageUsed / STORAGE_QUOTA_BYTES) * 100);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}
          </h1>
          <p className="mt-1 text-ink/50 dark:text-paper/50">Here's what's happening with your scans.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/dashboard/documents" className="btn-secondary text-sm">
            View all documents
          </Link>
          <Link to="/dashboard/new-scan" className="btn-primary text-sm">
            + New scan
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Documents", value: stats ? String(stats.document_count) : "—", loading: statsLoading },
          { label: "Pages scanned", value: stats ? String(stats.page_count) : "—", loading: statsLoading },
          { label: "Favorites", value: stats ? String(stats.favorite_count) : "—", loading: statsLoading },
          { label: "OCR characters", value: stats ? stats.ocr_char_count.toLocaleString() : "—", loading: statsLoading },
        ].map((card) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="card p-5"
          >
            <p className="text-sm text-ink/50 dark:text-paper/50">{card.label}</p>
            {card.loading ? (
              <Skeleton className="mt-2 h-8 w-16" />
            ) : (
              <p className="mt-1 font-display text-3xl font-semibold">{card.value}</p>
            )}
          </motion.div>
        ))}
      </div>

      {/* Storage usage */}
      <div className="card mt-4 p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Storage usage</p>
          {statsLoading ? (
            <Skeleton className="h-4 w-24" />
          ) : (
            <p className="text-xs text-ink/50 dark:text-paper/50">
              <span className="font-mono font-medium text-ink dark:text-paper">{formatBytes(storageUsed)}</span>{" "}
              of {formatBytes(STORAGE_QUOTA_BYTES)}
            </p>
          )}
        </div>
        {statsLoading ? (
          <Skeleton className="mt-3 h-2.5 w-full" />
        ) : (
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${storagePct}%` }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className={`h-full rounded-full ${storagePct > 85 ? "bg-red-500" : "bg-gradient-to-r from-brand-deep via-brand to-brand-soft"}`}
            />
          </div>
        )}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        {/* Recent activity */}
        <div>
          <h2 className="text-lg font-semibold">Recent activity</h2>
          {docsLoading ? (
            <div className="card mt-4 divide-y divide-line-light dark:divide-line-dark">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center justify-between px-5 py-4">
                  <div className="flex-1">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="mt-2 h-3 w-24" />
                  </div>
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="card mt-4 flex flex-col items-center gap-3 p-10 text-center">
              <p className="text-ink/60 dark:text-paper/60">
                No scans yet — your first one takes about a minute.
              </p>
              <Link to="/dashboard/new-scan" className="btn-primary">
                Scan your first document
              </Link>
            </div>
          ) : (
            <div className="card mt-4 divide-y divide-line-light dark:divide-line-dark">
              {recent.map((doc) => (
                <Link
                  key={doc.id}
                  to={`/dashboard/documents/${doc.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-4 transition hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{doc.title}</p>
                    <p className="text-xs text-ink/50 dark:text-paper/50">
                      {doc.category} · {doc.page_count} page{doc.page_count === 1 ? "" : "s"}
                      {doc.is_favorite && <span className="ml-1 text-flag">★</span>}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-ink/40 dark:text-paper/40">
                    {new Date(doc.updated_at).toLocaleDateString()}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recently edited / library */}
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Recently edited</h2>
            {statsLoading ? (
              <div className="card mt-4 space-y-3 p-5">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            ) : (stats?.recently_edited.length ?? 0) === 0 ? (
              <div className="card mt-4 p-5 text-sm text-ink/50 dark:text-paper/50">
                Documents you edit will show up here.
              </div>
            ) : (
              <div className="card mt-4 divide-y divide-line-light dark:divide-line-dark">
                {stats?.recently_edited.slice(0, 4).map((doc) => (
                  <Link
                    key={doc.id}
                    to={`/dashboard/documents/${doc.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
                  >
                    <p className="truncate text-sm font-medium">{doc.title}</p>
                    <span className="shrink-0 text-xs text-ink/40 dark:text-paper/40">
                      {new Date(doc.updated_at).toLocaleDateString()}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-lg font-semibold">Quick tools</h2>
            <div className="card mt-4 grid grid-cols-1 gap-2 p-3">
              <Link to="/dashboard/image-tools" className="rounded-lg px-3 py-2.5 text-sm font-medium transition hover:bg-brand/10 hover:text-brand">
                🖼️ Compress & convert images
              </Link>
              <Link to="/dashboard/pdf-tools" className="rounded-lg px-3 py-2.5 text-sm font-medium transition hover:bg-brand/10 hover:text-brand">
                📄 Merge, split & edit PDFs
              </Link>
              <Link to="/dashboard/documents?favorites=1" className="rounded-lg px-3 py-2.5 text-sm font-medium transition hover:bg-brand/10 hover:text-brand">
                ★ Favorite documents
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
