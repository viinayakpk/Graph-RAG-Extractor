// Central tuning parameters for the pipeline.
//
// Every value the behaviour is sensitive to lives here with its rationale, so the
// pipeline can be retuned in one place instead of hunting magic numbers across
// modules. Structural facts (OZ code formats, regexes) stay with the code that
// owns them; only thresholds, limits, and labels live here. Anything that varies
// by environment (concurrency) reads from an env var with a documented default.

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const profilerConfig = {
  /** Pages sampled to characterise a document's structure and text quality —
   *  enough signal for a 400-page tender without reading every page twice. */
  sampleSize: 30,
  /** Fraction of sampled characters that are ligature artefacts ("oﬃce") above
   *  which the PDF text layer is treated as degraded → parserConfidence "low". */
  ligatureCorruptionLowConfidence: 0.01,
  /** A line repeated on at least this fraction of sampled pages is a running
   *  header/footer rather than content, and is stripped during normalization. */
  repeatedHeaderPageFraction: 0.6,
} as const;

export const strategyConfig = {
  /** Minimum OZ position codes in the sample to classify a document as an LV
   *  (Leistungsverzeichnis) rather than free-form prose. */
  minOzPositions: 5,
  /** Minimum vorbemerkungen codes (00.00.00.*) to treat the document as having a
   *  real preamble section rather than incidental matches. */
  minVorbemerkungen: 10,
} as const;

export const chunkerConfig = {
  /** A heading line is short; longer lines are prose, not headings. */
  maxHeadingLength: 60,
  /** Neutral bucket label for content that precedes the first detected heading.
   *  Document-agnostic on purpose — not every tender's front matter is "admin". */
  defaultSectionHeading: "General Requirements",
} as const;

export const extractionConfig = {
  /** Rough token estimate for mixed German/English text: ~4 chars per token. */
  charsPerToken: 4,
  /** Chunks above this estimated token count are split before extraction so they
   *  fit the model context with room for the response. */
  maxChunkTokens: 3000,
  /** Concurrent DeepSeek calls. Keeps the 400+ chunk Salzburg run under provider
   *  rate limits. Override with CONCURRENCY_LIMIT. */
  concurrency: envInt("CONCURRENCY_LIMIT", 3),
} as const;
