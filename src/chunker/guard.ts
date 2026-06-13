import { extractionConfig, chunkerConfig } from "../config.js";

// A voided / cancelled LV position carries no requirement, so the chunker skips
// the LLM call for it. Markers are multilingual (see config).
//
// Anchored on purpose: a block is cancelled only when a whole LINE is essentially
// just a marker — optionally preceded by the position's code (e.g. "GU.59.04.01.01
// Entfällt", "01.01.0010 Entfällt", a bare "Entfällt"). A marker buried inside real
// prose ("the order may be cancelled with 30 days notice", "nothing shall be
// omitted") must NOT drop the block. We bias to false-negatives: if unsure, the
// block is kept and the LLM is the backstop — it returns no requirement for a
// genuinely cancelled position. Never drop a real priced position on a substring.
const MARKERS = chunkerConfig.cancelledPositionMarkers.join("|");
const CANCELLED_LINE_RE = new RegExp(
  `^(?:[A-Za-z]{0,3}[\\d.]{2,}\\s+)?[\\s"'.\\-–—„“”]*(?:${MARKERS})[\\s"'.!\\-–—„“”]*$`,
  "iu",
);

export function isCancelledPosition(content: string): boolean {
  return content.split("\n").some((line) => CANCELLED_LINE_RE.test(line.trim()));
}

export function estimateTokens(content: string): number {
  return Math.ceil(content.length / extractionConfig.charsPerToken);
}

export function exceedsTokenLimit(content: string): boolean {
  return estimateTokens(content) > extractionConfig.maxChunkTokens;
}
