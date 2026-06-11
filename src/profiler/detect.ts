import type { DocumentStrategy } from "../types/chunk.js";
import {
  OZ_3PART_RE,
  OZ_5PART_ALPHA_RE,
  OZ_VORBEMERKUNGEN_RE,
  countOzMatches,
} from "../parser/oz-patterns.js";
import { strategyConfig, profilerConfig } from "../config.js";

// LV pricing table header artifact: "EUR PP EUR", "EUR EP EUR" etc.
const LV_PRICING_TABLE_RE = /EUR\s+(PP|EP|SO|ST)\s+EUR/;

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
  const hasPositions = lvPositionCount > strategyConfig.minOzPositions;
  const hasPreamble = vorbemerkungenEstimate > strategyConfig.minVorbemerkungen;
  if (hasPositions && hasPreamble) return "mixed";
  if (hasPositions) return "lv-position";
  if (hasPreamble) return "vorbemerkungen-heavy";
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
  const threshold = pageTexts.length * profilerConfig.repeatedHeaderPageFraction;
  return [...lineFrequency.entries()]
    .filter(([, count]) => count >= threshold)
    .map(([line]) => line);
}
