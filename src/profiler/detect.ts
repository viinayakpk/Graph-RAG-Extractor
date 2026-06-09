import type { DocumentStrategy } from "../types/chunk.js";
import {
  OZ_3PART_RE,
  OZ_5PART_ALPHA_RE,
  OZ_VORBEMERKUNGEN_RE,
  countOzMatches,
} from "../parser/oz-patterns.js";

// LV pricing table header artifact: "EUR PP EUR", "EUR EP EUR" etc.
const LV_PRICING_TABLE_RE = /EUR\s+(PP|EP|SO|ST)\s+EUR/;

// Minimum OZ position count for a document to be classified as lv-position or mixed
const MIN_LV_POSITIONS_FOR_STRATEGY = 5;
// Minimum vorbemerkungen entry count to indicate a real preamble section vs. incidental use
const MIN_VORBEMERKUNGEN_FOR_STRATEGY = 10;

export function countOzPositions(text: string): number {
  return countOzMatches(text, OZ_3PART_RE) + countOzMatches(text, OZ_5PART_ALPHA_RE);
}

export function countVorbemerkungen(text: string): number {
  return countOzMatches(text, OZ_VORBEMERKUNGEN_RE);
}

export function hasColumnNoise(text: string): boolean {
  return LV_PRICING_TABLE_RE.test(text);
}

// Test whether a single page's text contains any vorbemerkungen OZ code
export function pageHasPreambleOz(text: string): boolean {
  return OZ_VORBEMERKUNGEN_RE.test(text);
}

export function detectStrategy(
  lvPositionCount: number,
  vorbemerkungenEstimate: number,
): DocumentStrategy {
  if (lvPositionCount > MIN_LV_POSITIONS_FOR_STRATEGY && vorbemerkungenEstimate > MIN_VORBEMERKUNGEN_FOR_STRATEGY) return "mixed";
  if (lvPositionCount > MIN_LV_POSITIONS_FOR_STRATEGY) return "lv-position";
  if (vorbemerkungenEstimate > MIN_VORBEMERKUNGEN_FOR_STRATEGY) return "vorbemerkungen-heavy";
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
