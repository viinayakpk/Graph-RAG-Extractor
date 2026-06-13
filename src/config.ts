// Central tuning parameters for the pipeline.
//
// Every value the behaviour is sensitive to lives here with its rationale, so the
// pipeline can be retuned in one place instead of hunting magic numbers across
// modules. Structural facts (OZ code formats, regexes) stay with the code that
// owns them; only thresholds, limits, labels, and vocabulary live here. Anything
// that varies by environment (concurrency) reads from an env var with a default.

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const profilerConfig = {
  /** Pages sampled to characterise structure and text quality. Scales with length
   *  — a fixed 30 is only ~7% of a 400-page tender and can miss a mid-document
   *  section — but stays bounded so profiling a very large tender stays fast. */
  sampleSizeMin: 30,
  sampleSizeFraction: 0.1,
  sampleSizeMax: 60,
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
  /** Minimum vorbemerkungen codes to treat the document as having a real preamble
   *  section rather than incidental matches. */
  minVorbemerkungen: 10,
} as const;

export const chunkerConfig = {
  /** A heading line is short; longer lines are prose, not headings. */
  maxHeadingLength: 60,
  /** Neutral bucket label for content that precedes the first detected heading.
   *  Document-agnostic on purpose — not every tender's front matter is "admin". */
  defaultSectionHeading: "General Requirements",
  /** Markers of a voided/cancelled LV position, across the languages we target.
   *  A match skips the LLM call for that block; the LLM is the backstop (it returns
   *  no requirement for a cancelled position anyway). Regex fragments, case-
   *  insensitive — extend per locale rather than hardcoding one language. */
  cancelledPositionMarkers: [
    "entf[äa]llt", // de
    "not applicable", // en
    "n/a", // en
    "cancelled", // en
    "voided", // en
    "omitted", // en
    "sans objet", // fr
    "supprim", // fr (supprimé/supprimée)
    "soppress", // it (soppresso/soppressa)
    "annull", // it/fr (annullato/annulé)
    "anulad", // es (anulado/anulada)
  ],
} as const;

export const geometryConfig = {
  /** Two glyphs share a line when their baselines differ by less than this fraction
   *  of the page's median glyph height. */
  lineYToleranceRatio: 0.5,
  /** A horizontal gap wider than this fraction of the font size becomes a space. */
  wordGapRatio: 0.25,
} as const;

export const linkingConfig = {
  /** Semantic linking pulls a deliverable's scattered pieces onto one leaf when they
   *  share no position code or exact text (the brief's "named on p.60, specced on
   *  p.382" case). It is gated by an LLM discriminator and a hard structural rule:
   *  a merged leaf may hold at most ONE priced OZ position, so two distinct line
   *  items can never fuse. */
  /** At or below this requirement count we compare all eligible pairs across the
   *  whole tender (catches cross-section links). Above it we block by category /
   *  section to stay bounded; cross-block links wait for the embedding pass. */
  fullPairwiseMaxReqs: 300,
  /** A pair is a candidate when the shorter description's tokens are at least this
   *  fraction inside the other (overlap coefficient — robust to a short scope line
   *  vs a long spec, where Jaccard would wrongly score low). */
  overlapThreshold: 0.5,
  /** Cap on discriminator pairs per block, highest-overlap first. */
  maxPairsPerBlock: 25,
  /** Global safety cap on discriminator calls, so a huge tender cannot run away. */
  maxDiscriminatorCalls: 600,
} as const;

export const extractionConfig = {
  /** Rough token estimate for mixed-language text: ~4 chars per token. */
  charsPerToken: 4,
  /** Chunks above this estimated token count are split before extraction. Kept
   *  modest so each LLM call sees a focused block (better recall); splits stay
   *  mergeable because every part keeps its position metadata. */
  maxChunkTokens: 3000,
  /** Concurrent DeepSeek calls. Keeps the 400+ chunk Salzburg run under provider
   *  rate limits. Override with CONCURRENCY_LIMIT. */
  concurrency: envInt("CONCURRENCY_LIMIT", 3),
  /** Second-pass gleaner: after the first extraction of a block, re-read it for any
   *  obligation the first pass missed (recall). Costs one extra call per non-empty
   *  block; cached with the block's result. Disable with RECALL_GLEANER=0. */
  recallGleaner: process.env["RECALL_GLEANER"] !== "0",
} as const;
