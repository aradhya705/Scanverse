import { useCallback, useEffect, useRef, useState } from "react";

interface CornerAdjusterProps {
  imageUrl: string;
  corners: number[][]; // 4 points [x, y] in natural image pixel coordinates, TL/TR/BR/BL
  onChange: (corners: number[][]) => void;
}

const LABELS = ["Top-left", "Top-right", "Bottom-right", "Bottom-left"];

export default function CornerAdjuster({ imageUrl, corners, onChange }: CornerAdjusterProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number } | null>(null);
  const draggingIndex = useRef<number | null>(null);

  const updateDisplaySize = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDisplaySize({ w: rect.width, h: rect.height });
    }
  }, []);

  useEffect(() => {
    window.addEventListener("resize", updateDisplaySize);
    return () => window.removeEventListener("resize", updateDisplaySize);
  }, [updateDisplaySize]);

  if (!corners || corners.length !== 4) return null;

  const scaleX = naturalSize && displaySize ? displaySize.w / naturalSize.w : 1;
  const scaleY = naturalSize && displaySize ? displaySize.h / naturalSize.h : 1;

  const displayPoints = corners.map(([x, y]) => [x * scaleX, y * scaleY]);

  function toNaturalPoint(clientX: number, clientY: number): [number, number] {
    const rect = containerRef.current!.getBoundingClientRect();
    const dx = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    const dy = Math.min(Math.max(clientY - rect.top, 0), rect.height);
    return [dx / scaleX, dy / scaleY];
  }

  function handlePointerDown(index: number, e: React.PointerEvent) {
    e.preventDefault();
    draggingIndex.current = index;
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (draggingIndex.current === null) return;
    const [nx, ny] = toNaturalPoint(e.clientX, e.clientY);
    const next = corners.map((p) => [...p]);
    next[draggingIndex.current] = [nx, ny];
    onChange(next);
  }

  function handlePointerUp() {
    draggingIndex.current = null;
  }

  const polygonPoints = displayPoints.map(([x, y]) => `${x},${y}`).join(" ");

  return (
    <div ref={containerRef} className="relative w-full select-none">
      <img
        src={imageUrl}
        alt="Scanned document"
        className="pointer-events-none w-full rounded-lg"
        onLoad={(e) => {
          const img = e.currentTarget;
          setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
          updateDisplaySize();
        }}
        draggable={false}
      />
      {naturalSize && displaySize && (
        <svg
          className="absolute inset-0 h-full w-full touch-none"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <polygon points={polygonPoints} fill="rgba(157,78,221,0.18)" stroke="#9D4EDD" strokeWidth={2} />
          {displayPoints.map(([x, y], i) => (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={10}
              fill="#9D4EDD"
              stroke="white"
              strokeWidth={2}
              className="cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => handlePointerDown(i, e)}
            >
              <title>{LABELS[i]}</title>
            </circle>
          ))}
        </svg>
      )}
    </div>
  );
}
