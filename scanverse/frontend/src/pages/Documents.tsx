import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteDocument, listDocuments, updateDocument } from "@/api/client";
import { useToast } from "@/context/ToastContext";

export default function Documents() {
  const [searchParams] = useSearchParams();
  const favoritesOnly = searchParams.get("favorites") === "1";
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: documents, isLoading } = useQuery({
    queryKey: ["documents", { search, favoritesOnly }],
    queryFn: () => listDocuments({ q: search || undefined, favorites_only: favoritesOnly || undefined }),
  });

  const toggleFavorite = useMutation({
    mutationFn: ({ id, is_favorite }: { id: string; is_favorite: boolean }) =>
      updateDocument(id, { is_favorite }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      showToast(variables.is_favorite ? "Added to favorites" : "Removed from favorites", "success");
    },
    onError: () => showToast("Couldn't update favorite — try again", "error"),
  });

  const removeDoc = useMutation({
    mutationFn: (id: string) => deleteDocument(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      showToast("Document deleted", "success");
    },
    onError: () => showToast("Couldn't delete document — try again", "error"),
  });

  const categories = useMemo(
    () => Array.from(new Set((documents ?? []).map((d) => d.category))),
    [documents]
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {favoritesOnly ? "Favorite documents" : "Documents"}
        </h1>
        <Link to="/dashboard/new-scan" className="btn-primary">
          + New scan
        </Link>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title or extracted text…"
          className="input max-w-sm"
        />
        {categories.length > 0 && (
          <span className="hidden text-xs text-ink/40 sm:inline">{categories.length} categories</span>
        )}
      </div>

      {isLoading && <p className="mt-8 text-sm text-ink/50">Loading…</p>}

      {!isLoading && (documents ?? []).length === 0 && (
        <div className="card mt-8 flex flex-col items-center gap-3 p-12 text-center">
          <p className="text-ink/60">
            {favoritesOnly ? "No favorites yet." : "No documents match your search."}
          </p>
          <Link to="/dashboard/new-scan" className="btn-primary">
            Scan a document
          </Link>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(documents ?? []).map((doc) => (
          <div key={doc.id} className="card group relative flex flex-col p-5">
            <button
              onClick={() => toggleFavorite.mutate({ id: doc.id, is_favorite: !doc.is_favorite })}
              className={`absolute right-4 top-4 text-lg ${doc.is_favorite ? "text-flag" : "text-ink/20 hover:text-ink/40"}`}
              aria-label={doc.is_favorite ? "Remove from favorites" : "Add to favorites"}
            >
              ★
            </button>
            <Link to={`/dashboard/documents/${doc.id}`} className="pr-8">
              <p className="font-medium">{doc.title}</p>
              <p className="mt-1 text-xs text-ink/50">
                {doc.category} · {doc.page_count} page{doc.page_count === 1 ? "" : "s"}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {doc.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-ink/60 dark:bg-white/10">
                    {tag}
                  </span>
                ))}
              </div>
            </Link>
            <div className="mt-4 flex items-center justify-between border-t border-line-light pt-3 text-xs text-ink/40">
              <span>Updated {new Date(doc.updated_at).toLocaleDateString()}</span>
              <button
                onClick={() => {
                  if (confirm(`Delete "${doc.title}"? This can't be undone.`)) removeDoc.mutate(doc.id);
                }}
                className="text-red-400 opacity-0 transition group-hover:opacity-100 hover:text-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
