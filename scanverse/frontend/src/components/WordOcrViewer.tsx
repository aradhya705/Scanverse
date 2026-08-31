import { useState, useRef, useEffect, useCallback } from "react";
import type { OcrWord, OcrLine, OcrResult } from "@/api/client";
import { mediaUrl } from "@/api/client";

interface WordOcrViewerProps {
  imageUrl: string;
  ocrResult: OcrResult | null;
  onWordClick?: (word: OcrWord) => void;
  onWordUpdate?: (wordId: number, newText: string) => void;
  showConfidence?: boolean;
  highlightLowConfidence?: boolean;
}

interface ImageDimensions {
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
}

export default function WordOcrViewer({
  imageUrl,
  ocrResult,
  onWordClick,
  onWordUpdate,
  showConfidence = true,
  highlightLowConfidence = true,
}: WordOcrViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageDims, setImageDims] = useState<ImageDimensions | null>(null);
  const [hoveredWord, setHoveredWord] = useState<OcrWord | null>(null);
  const [selectedWord, setSelectedWord] = useState<OcrWord | null>(null);
  const [editingWord, setEditingWord] = useState<OcrWord | null>(null);
  const [editText, setEditText] = useState("");
  const [showAllWords, setShowAllWords] = useState(true);
  const [confidenceFilter, setConfidenceFilter] = useState<"all" | "high" | "medium" | "low">("all");

  const resolvedUrl = mediaUrl(imageUrl) || imageUrl;

  const handleImageLoad = useCallback(() => {
    if (imageRef.current) {
      const img = imageRef.current;
      setImageDims({
        width: img.clientWidth,
        height: img.clientHeight,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      });
    }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (imageRef.current) {
        handleImageLoad();
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [handleImageLoad]);

  const getWordScale = useCallback(
    (word: OcrWord) => {
      if (!imageDims) return { x: 0, y: 0, w: 0, h: 0 };
      const scaleX = imageDims.width / imageDims.naturalWidth;
      const scaleY = imageDims.height / imageDims.naturalHeight;
      const [tl, tr, br, bl] = word.bbox;
      return {
        x: tl[0] * scaleX,
        y: tl[1] * scaleY,
        w: (tr[0] - tl[0]) * scaleX,
        h: (bl[1] - tl[1]) * scaleY,
      };
    },
    [imageDims]
  );

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return "bg-green-500/20 border-green-500/60 text-green-700";
    if (confidence >= 0.5) return "bg-yellow-500/20 border-yellow-500/60 text-yellow-700";
    return "bg-red-500/20 border-red-500/60 text-red-700";
  };

  const getConfidenceBg = (confidence: number): string => {
    if (confidence >= 0.8) return "rgba(34, 197, 94, 0.15)";
    if (confidence >= 0.5) return "rgba(234, 179, 8, 0.15)";
    return "rgba(239, 68, 68, 0.15)";
  };

  const getConfidenceBorder = (confidence: number): string => {
    if (confidence >= 0.8) return "rgba(34, 197, 94, 0.6)";
    if (confidence >= 0.5) return "rgba(234, 179, 8, 0.6)";
    return "rgba(239, 68, 68, 0.6)";
  };

  const isWordVisible = (word: OcrWord): boolean => {
    if (!showAllWords) return false;
    if (confidenceFilter === "high") return word.confidence >= 0.8;
    if (confidenceFilter === "medium") return word.confidence >= 0.5 && word.confidence < 0.8;
    if (confidenceFilter === "low") return word.confidence < 0.5;
    return true;
  };

  const handleWordClick = (word: OcrWord) => {
    setSelectedWord(word);
    onWordClick?.(word);
  };

  const handleWordDoubleClick = (word: OcrWord) => {
    setEditingWord(word);
    setEditText(word.text);
  };

  const handleEditSubmit = () => {
    if (editingWord && editText.trim()) {
      onWordUpdate?.(editingWord.id, editText.trim());
      setEditingWord(null);
      setEditText("");
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleEditSubmit();
    } else if (e.key === "Escape") {
      setEditingWord(null);
      setEditText("");
    }
  };

  const filteredWords = ocrResult?.words.filter(isWordVisible) || [];
  const wordCount = filteredWords.length;
  const lowConfidenceCount = filteredWords.filter((w) => w.low_confidence).length;
  const avgConfidence = wordCount > 0 ? filteredWords.reduce((sum, w) => sum + w.confidence, 0) / wordCount : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-ink/60">Show:</label>
          <select
            value={confidenceFilter}
            onChange={(e) => setConfidenceFilter(e.target.value as any)}
            className="input w-32 text-xs"
          >
            <option value="all">All words</option>
            <option value="high">High confidence</option>
            <option value="medium">Medium confidence</option>
            <option value="low">Low confidence</option>
          </select>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-ink/60">
          <input
            type="checkbox"
            checked={showAllWords}
            onChange={(e) => setShowAllWords(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-line-light"
          />
          Show bounding boxes
        </label>
        {showConfidence && (
          <label className="flex items-center gap-1.5 text-xs text-ink/60">
            <input
              type="checkbox"
              checked={highlightLowConfidence}
              onChange={(e) => setHighlightLowConfidence(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-line-light"
            />
            Highlight low confidence
          </label>
        )}
      </div>

      {/* Stats bar */}
      {ocrResult && (
        <div className="flex flex-wrap gap-4 text-xs text-ink/50">
          <span>
            <strong className="text-ink/70">{wordCount}</strong> words
          </span>
          {lowConfidenceCount > 0 && (
            <span className="text-amber-600">
              <strong>{lowConfidenceCount}</strong> low confidence
            </span>
          )}
          <span>
            Avg confidence: <strong className="text-ink/70">{(avgConfidence * 100).toFixed(1)}%</strong>
          </span>
          <span>
            Lines: <strong className="text-ink/70">{ocrResult.line_count}</strong>
          </span>
        </div>
      )}

      {/* Image with word overlays */}
      <div ref={containerRef} className="relative inline-block w-full overflow-hidden rounded-lg border border-line-light">
        <img
          ref={imageRef}
          src={resolvedUrl}
          alt="Scanned document"
          className="w-full"
          onLoad={handleImageLoad}
          draggable={false}
        />

        {/* Word bounding boxes overlay */}
        {showAllWords && imageDims && (
          <div className="absolute inset-0">
            {ocrResult?.words.map((word) => {
              const dims = getWordScale(word);
              const isVisible = isWordVisible(word);
              const isHovered = hoveredWord?.id === word.id;
              const isSelected = selectedWord?.id === word.id;
              const isEditing = editingWord?.id === word.id;

              if (!isVisible) return null;

              return (
                <div
                  key={word.id}
                  className={`absolute cursor-pointer transition-all duration-150 ${
                    highlightLowConfidence && word.low_confidence
                      ? "border-2 border-dashed"
                      : "border-1 border-solid"
                  } ${isHovered ? "z-20 scale-105" : ""} ${isSelected ? "z-10 ring-2 ring-brand" : ""}`}
                  style={{
                    left: dims.x,
                    top: dims.y,
                    width: dims.w,
                    height: dims.h,
                    backgroundColor: showConfidence ? getConfidenceBg(word.confidence) : "transparent",
                    borderColor: showConfidence ? getConfidenceBorder(word.confidence) : "transparent",
                  }}
                  onMouseEnter={() => setHoveredWord(word)}
                  onMouseLeave={() => setHoveredWord(null)}
                  onClick={() => handleWordClick(word)}
                  onDoubleClick={() => handleWordDoubleClick(word)}
                >
                  {/* Confidence indicator dot */}
                  {showConfidence && (
                    <div
                      className={`absolute -right-1 -top-1 h-2 w-2 rounded-full ${
                        word.confidence >= 0.8
                          ? "bg-green-500"
                          : word.confidence >= 0.5
                          ? "bg-yellow-500"
                          : "bg-red-500"
                      }`}
                    />
                  )}

                  {/* Word tooltip on hover */}
                  {isHovered && !isEditing && (
                    <div className="absolute -top-8 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded bg-ink px-2 py-1 text-[10px] text-white shadow-lg">
                      {word.text} ({(word.confidence * 100).toFixed(0)}%)
                    </div>
                  )}

                  {/* Inline edit mode */}
                  {isEditing && (
                    <input
                      type="text"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onBlur={handleEditSubmit}
                      onKeyDown={handleEditKeyDown}
                      className="absolute inset-0 z-30 w-full border-2 border-brand bg-white px-1 font-mono text-xs focus:outline-none"
                      autoFocus
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected word details */}
      {selectedWord && (
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-mono text-lg font-semibold">{selectedWord.text}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getConfidenceColor(selectedWord.confidence)}`}>
                {(selectedWord.confidence * 100).toFixed(1)}%
              </span>
            </div>
            <button
              onClick={() => setSelectedWord(null)}
              className="text-ink/40 hover:text-ink/60"
            >
              ✕
            </button>
          </div>
          <div className="mt-2 text-xs text-ink/50">
            <p>
              Position: ({selectedWord.bbox[0][0]}, {selectedWord.bbox[0][1]}) → ({selectedWord.bbox[2][0]}, {selectedWord.bbox[2][1]})
            </p>
            <p>Line {selectedWord.line_index + 1} • Word #{selectedWord.id + 1}</p>
          </div>
          <button
            onClick={() => handleWordDoubleClick(selectedWord)}
            className="mt-2 text-xs text-brand hover:underline"
          >
            Edit word
          </button>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-ink/50">
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span>High (≥80%)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-yellow-500" />
          <span>Medium (50-80%)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-red-500" />
          <span>Low (&lt;50%)</span>
        </div>
        <span className="text-ink/30">•</span>
        <span>Double-click word to edit</span>
      </div>
    </div>
  );
}
