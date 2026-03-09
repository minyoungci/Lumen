const DEFAULT_MEMBER_COLORS = [
  "#4f46e5",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#8b5cf6",
  "#14b8a6",
  "#84cc16",
  "#f97316",
];

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function normalizeHexColor(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!HEX_COLOR_PATTERN.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

export function resolveMemberColor(userId?: string | null, preferred?: string | null): string {
  const normalized = normalizeHexColor(preferred);
  if (normalized) return normalized;
  if (!userId) return DEFAULT_MEMBER_COLORS[0];
  const idx = hashString(userId) % DEFAULT_MEMBER_COLORS.length;
  return DEFAULT_MEMBER_COLORS[idx];
}

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = normalizeHexColor(hex) ?? "#4f46e5";
  const raw = normalized.replace("#", "");
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function avatarGradient(color: string): string {
  return `linear-gradient(135deg, ${color}, ${hexToRgba(color, 0.7)})`;
}

