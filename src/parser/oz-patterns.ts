// Standard Austrian/German LV position formats (ÖNORM B 2063)

// 3-segment numeric: 01.01.0010 — two-digit group, two-digit subgroup, four-digit serial
export const OZ_3PART_RE = /\d{2}\.\d{2}\.\d{4}/;

// 5-segment alphanumeric: GU.07.09.01.01 — two-letter building code + four two-digit segments
export const OZ_5PART_ALPHA_RE = /[A-Z]{2}\.\d{2}\.\d{2}\.\d{2}\.\d{2}/;

// 5-segment vorbemerkungen preamble: 00.00.00.09.01 — always starts with 00.00.00
export const OZ_VORBEMERKUNGEN_RE = /00\.00\.00\.\d{2}\.\d{2}/;

// Anchored pattern for testing a single trimmed line against all three formats
export const OZ_LINE_RE =
  /^(?:\d{2}\.\d{2}\.\d{4}|[A-Z]{2}\.\d{2}\.\d{2}\.\d{2}\.\d{2}|00\.00\.00\.\d{2}\.\d{2})$/;

// Count all non-overlapping occurrences of pattern in text (equivalent to match with /g)
export function countOzMatches(text: string, pattern: RegExp): number {
  return (text.match(new RegExp(pattern.source, "g")) ?? []).length;
}
