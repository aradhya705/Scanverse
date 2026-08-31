interface LogoProps {
  size?: number;
  animated?: boolean;
  className?: string;
}

/**
 * The ScanVerse mark: four corner brackets (the exact shape drawn around a
 * document mid-detection) with an optional sweeping scan-line. This is the
 * product's real edge-detection UI distilled into a brand signature.
 */
export default function Logo({ size = 32, animated = false, className = "" }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path d="M2 12V5a3 3 0 0 1 3-3h7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M38 12V5a3 3 0 0 0-3-3h-7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M2 28v7a3 3 0 0 0 3 3h7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M38 28v7a3 3 0 0 1-3 3h-7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      {animated && (
        <rect x="4" y="4" width="32" height="2" fill="#9D4EDD" className="animate-sweep" opacity="0.9" />
      )}
    </svg>
  );
}
