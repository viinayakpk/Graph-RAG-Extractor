// Central tuning parameters: thresholds, limits, and vocabulary in one place.
// Environment-varying values read from env vars with a default.

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const profilerConfig = {
  // Pages sampled to characterise structure and text quality (scales with length, bounded).
  sampleSizeMin: 30,
  sampleSizeFraction: 0.1,
  sampleSizeMax: 60,
  // Ligature-artefact fraction above which the text layer is treated as degraded.
  ligatureCorruptionLowConfidence: 0.01,
  // A line on at least this fraction of pages is a running header/footer.
  repeatedHeaderPageFraction: 0.6,
} as const;

export const strategyConfig = {
  // Minimum OZ positions / vorbemerkungen codes to classify a document as an LV.
  minOzPositions: 5,
  minVorbemerkungen: 10,
} as const;

export const positionCodeConfig = {
  // Labelled-position code families recognised for enrichment (ÖNORM A/B 2063 OZ).
  // A specialisation — documents without these still chunk via the generic path.
  threePart: String.raw`\d{2}\.\d{2}\.\d{3,5}`,
  fivePartAlpha: String.raw`[A-Z]{2}\.\d{2}\.\d{2}\.\d{2}\.\d{2}`,
  vorbemerkungenPrefix: "00.00.00",
} as const;

export const chunkerConfig = {
  maxHeadingLength: 60,
  // Neutral label for content before the first detected heading.
  defaultSectionHeading: "General Requirements",
  // Multilingual markers of a voided/cancelled position (regex fragments, case-insensitive).
  cancelledPositionMarkers: [
    "entf[äa]llt",
    "not applicable",
    "n/a",
    "cancelled",
    "voided",
    "omitted",
    "sans objet",
    "supprim",
    "soppress",
    "annull",
    "anulad",
  ],
} as const;

export const geometryConfig = {
  // Two glyphs share a line within this fraction of the median glyph height.
  lineYToleranceRatio: 0.5,
  // A horizontal gap wider than this fraction of the font size becomes a space.
  wordGapRatio: 0.25,
} as const;

export const linkingConfig = {
  // At/below this many requirements compare all eligible pairs; above, block by category/section.
  fullPairwiseMaxReqs: 300,
  // Overlap-coefficient threshold for a candidate pair.
  overlapThreshold: 0.5,
  maxPairsPerBlock: 25,
  // Global cap on discriminator calls so a huge tender cannot run away.
  maxDiscriminatorCalls: 600,
} as const;

export const extractionConfig = {
  charsPerToken: 4,
  // Chunks above this token estimate are split before extraction.
  maxChunkTokens: 3000,
  // Concurrent DeepSeek calls (override with CONCURRENCY_LIMIT).
  concurrency: envInt("CONCURRENCY_LIMIT", 3),
  // Second-pass gleaner for recall (disable with RECALL_GLEANER=0).
  recallGleaner: process.env["RECALL_GLEANER"] !== "0",
} as const;
