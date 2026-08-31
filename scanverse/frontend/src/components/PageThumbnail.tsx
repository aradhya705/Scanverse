import { mediaUrl } from "@/api/client";
import type { Page } from "@/types";

interface PageThumbnailProps {
  pages: Page[];
  activePageId: string | null;
  onSelect: (pageId: string) => void;
  onReorder: (pageIdsInOrder: string[]) => void;
  onRotate: (pageId: string) => void;
  onDuplicate: (pageId: string) => void;
  onDelete: (pageId: string) => void;
}

export default function PageThumbnail({
  pages,
  activePageId,
  onSelect,
  onReorder,
  onRotate,
  onDuplicate,
  onDelete,
}: PageThumbnailProps) {
  function handleDragStart(e: React.DragEvent, pageId: string) {
    e.dataTransfer.setData("text/plain", pageId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("text/plain");
    if (draggedId === targetId) return;

    const order = pages.map((p) => p.id);
    const fromIndex = order.indexOf(draggedId);
    const toIndex = order.indexOf(targetId);
    order.splice(fromIndex, 1);
    order.splice(toIndex, 0, draggedId);
    onReorder(order);
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {pages.map((page, idx) => (
        <div
          key={page.id}
          draggable
          onDragStart={(e) => handleDragStart(e, page.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, page.id)}
          onClick={() => onSelect(page.id)}
          className={`group relative w-28 shrink-0 cursor-pointer rounded-lg border-2 p-1 transition ${
            activePageId === page.id ? "border-brand" : "border-transparent hover:border-line-light"
          }`}
        >
          <div className="aspect-[3/4] overflow-hidden rounded bg-black/5">
            {(page.thumbnail_url || page.original_url) && (
              <img
                src={mediaUrl(page.thumbnail_url || page.original_url) || ""}
                alt={`Page ${idx + 1}`}
                className="h-full w-full object-cover"
              />
            )}
          </div>
          <p className="mt-1 text-center text-[11px] text-ink/50">Page {idx + 1}</p>

          <div className="absolute inset-x-0 top-1 flex justify-end gap-1 px-1 opacity-0 transition group-hover:opacity-100">
            <button
              title="Rotate"
              onClick={(e) => {
                e.stopPropagation();
                onRotate(page.id);
              }}
              className="rounded bg-white/90 p-1 text-[11px] shadow"
            >
              ⟳
            </button>
            <button
              title="Duplicate"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate(page.id);
              }}
              className="rounded bg-white/90 p-1 text-[11px] shadow"
            >
              ⧉
            </button>
            <button
              title="Delete"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(page.id);
              }}
              className="rounded bg-white/90 p-1 text-[11px] text-red-500 shadow"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
