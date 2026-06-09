import type { DocumentStrategy } from "../types/chunk.js";

// Numeric 3-segment OZ: 01.01.0010 (Fahrradgaragen-style)
const OZ_NUMERIC_RE = /\d{2}\.\d{2}\.\d{4}/g;
// 5-segment alphanumeric OZ: GU.07.01.01.01 (Salzburg room positions)
const OZ_5PART_RE = /[A-Z]{2}\.\d{2}\.\d{2}\.\d{2}\.\d{2}/g;
// 5-segment preamble OZ: 00.00.00.09.01 (Salzburg vorbemerkungen)
const OZ_PREAMBLE_RE = /00\.00\.00\.\d{2}\.\d{2}/g;
// LV pricing table header artifact: "EUR PP EUR", "EUR EP EUR" etc.
const LV_PRICING_TABLE_RE = /EUR\s+(PP|EP|SO|ST)\s+EUR/;

export function countOzPositions(text: string): number {
  return (
    (text.match(OZ_NUMERIC_RE) ?? []).length +
    (text.match(OZ_5PART_RE) ?? []).length
  );
}

export function countVorbemerkungen(text: string): number {
  return (text.match(OZ_PREAMBLE_RE) ?? []).length;
}

export function hasColumnNoise(text: string): boolean {
  return LV_PRICING_TABLE_RE.test(text);
}

export function detectStrategy(
  lvPositionCount: number,
  vorbemerkungenEstimate: number,
): DocumentStrategy {
  if (lvPositionCount > 5 && vorbemerkungenEstimate > 10) return "mixed";
  if (lvPositionCount > 5) return "lv-position";
  if (vorbemerkungenEstimate > 10) return "vorbemerkungen-heavy";
  return "section-list";
}

export function detectRepeatedHeaders(pageTexts: string[]): string[] {
  const lineFrequency = new Map<string, number>();
  for (const text of pageTexts) {
    const seen = new Set<string>();
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length > 3 && !seen.has(trimmed)) {
        lineFrequency.set(trimmed, (lineFrequency.get(trimmed) ?? 0) + 1);
        seen.add(trimmed);
      }
    }
  }
  const threshold = pageTexts.length * 0.6;
  return [...lineFrequency.entries()]
    .filter(([, count]) => count >= threshold)
    .map(([line]) => line);
}
