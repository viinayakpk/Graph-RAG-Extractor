import { extractionConfig, chunkerConfig } from "../config.js";

// Anchored cancelled-position match: a whole line that is essentially just a marker
// (optionally behind its position code). A marker buried in prose must not drop the
// block — bias to keeping it, since the LLM is the backstop.
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
