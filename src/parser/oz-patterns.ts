// Labelled-position code families (ÖNORM A/B 2063 "Ordnungszahl", OZ). The actual
// patterns live in `positionCodeConfig` so a new tender format is a config edit, not
// a code change; this module just compiles them. Anything outside these families is
// still captured by the chunker's generic labelled-item path — just without the
// position/category enrichment.
import { positionCodeConfig } from "../config.js";

// Leistungsgruppe.Unterleistungsgruppe.serial — e.g. "01.01.0010".
export const OZ_3PART_RE = new RegExp(positionCodeConfig.threePart);

// Building/room code + four numeric segments — e.g. "GU.07.09.01.01".
export const OZ_5PART_ALPHA_RE = new RegExp(positionCodeConfig.fivePartAlpha);

// Vorbemerkungen (preamble) codes begin with the all-zero prefix + two segments.
export const OZ_VORBEMERKUNGEN_RE = new RegExp(
  `${positionCodeConfig.vorbemerkungenPrefix.replace(/\./g, "\\.")}\\.\\d{2}\\.\\d{2}`,
);

// Anchored test for a whole trimmed token being any OZ format. Built from the
// patterns above so a change to any one of them propagates here automatically.
export const OZ_LINE_RE = new RegExp(
  `^(?:${OZ_3PART_RE.source}|${OZ_5PART_ALPHA_RE.source}|${OZ_VORBEMERKUNGEN_RE.source})$`,
);

// Count all non-overlapping occurrences of pattern in text (equivalent to match with /g)
export function countOzMatches(text: string, pattern: RegExp): number {
  return (text.match(new RegExp(pattern.source, "g")) ?? []).length;
}
