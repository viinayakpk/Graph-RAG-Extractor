import type { DocumentStrategy } from "../types/chunk.js";

// OZ position patterns for different LV document formats
const OZ_FAHRRADGARAGEN = /\d{2}\.\d{2}\.\d{4}/g;
const OZ_SALZBURG_ROOM = /[A-Z]{2}\.\d{2}\.\d{2}\.\d{2}\.\d{2}/g;
const OZ_SALZBURG_VORB = /00\.00\.00\.\d{2}\.\d{2}/g;
const COLUMN_NOISE = /EUR\s+(PP|EP|SO|ST)\s+EUR/;
const LIGATURE_ARTIFACTS = /instal{1,2}a[oi]n|o[fﬃ]{1,3}ce|publica[oi]n/i;

export function countOzPositions(text: string): number {
  return (
    (text.match(OZ_FAHRRADGARAGEN) ?? []).length +
    (text.match(OZ_SALZBURG_ROOM) ?? []).length
  );
}

export function countVorbemerkungen(text: string): number {
  return (text.match(OZ_SALZBURG_VORB) ?? []).length;
}

export function hasColumnNoise(text: string): boolean {
  return COLUMN_NOISE.test(text);
}

export function hasLigatureArtifacts(text: string): boolean {
  return LIGATURE_ARTIFACTS.test(text);
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
