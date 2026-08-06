import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listDocuments } from "@/api/client";
import { useAuth } from "@/context/AuthContext";

export default function Dashboard() {
  const { user } = useAuth();
  const { data: documents, isLoading } = useQuery({
    queryKey: ["documents", "recent"],
    queryFn: () => listDocuments(),
  });

  const recent = (documents ?? []).slice(0, 5);
  const totalPages = (documents ?? []).reduce((sum, d) => sum + d.page_count, 0);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">
        Welcome back{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}
      </h1>
      <p className="mt-1 text-ink/50">Here's what's happening with your scans.</p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-sm text-ink/50">Documents</p>
          <p className="mt-1 font-display text-3xl font-semibold">{documents?.length ?? "—"}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-ink/50">Pages scanned</p>
          <p className="mt-1 font-display text-3xl font-semibold">{totalPages || "—"}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-ink/50">Favorites</p>
          <p className="mt-1 font-display text-3xl font-semibold">
            {documents?.filter((d) => d.is_favorite).length ?? "—"}
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/dashboard/new-scan" className="btn-primary">
          + New scan
        </Link>
        <Link to="/dashboard/documents" className="btn-secondary">
          View all documents
        </Link>
      </div>

      <div className="mt-10">
        <h2 className="text-lg font-semibold">Recent activity</h2>
        {isLoading && <p className="mt-3 text-sm text-ink/50">Loading…</p>}
        {!isLoading && recent.length === 0 && (
          <div className="card mt-4 flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-ink/60">No scans yet — your first one takes about a minute.</p>
            <Link to="/dashboard/new-scan" className="btn-primary">
              Scan your first document
            </Link>
          </div>
        )}
        <div className="mt-4 divide-y divide-line-light card">
          {recent.map((doc) => (
            <Link
              key={doc.id}
              to={`/dashboard/documents/${doc.id}`}
              className="flex items-center justify-between px-5 py-4 transition hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
            >
              <div>
                <p className="font-medium">{doc.title}</p>
                <p className="text-xs text-ink/50">
                  {doc.category} · {doc.page_count} page{doc.page_count === 1 ? "" : "s"}
                </p>
              </div>
              <span className="text-xs text-ink/40">
                {new Date(doc.updated_at).toLocaleDateString()}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
