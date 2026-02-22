export function LumenLogo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect width="28" height="28" rx="7" fill="#0d0d0d" />
      {/* vertical stroke */}
      <rect x="7" y="5" width="4" height="18" fill="url(#lumen-lv)" />
      {/* horizontal stroke */}
      <rect x="7" y="19" width="14" height="4" fill="url(#lumen-lh)" />
      <defs>
        <linearGradient id="lumen-lv" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient id="lumen-lh" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.2" />
        </linearGradient>
      </defs>
    </svg>
  );
}
