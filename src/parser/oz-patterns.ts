// Austrian/German LV position numbers (Ordnungszahl, OZ) per ÖNORM A/B 2063.
// The hierarchy depth and serial width vary between projects and norm-book
// editions, so these match the common families rather than one rigid format.
// Anything outside them is still captured by the chunker's generic labelled-item
// path — just without OZ-specific enrichment (lv_position / category_code).

// Leistungsgruppe.Unterleistungsgruppe.serial — e.g. "01.01.0010".
// The serial runs 3–5 digits across editions, so it is not pinned to exactly 4.
export const OZ_3PART_RE = /\d{2}\.\d{2}\.\d{3,5}/;

// Building/room code + four numeric segments — e.g. "GU.07.09.01.01".
export const OZ_5PART_ALPHA_RE = /[A-Z]{2}\.\d{2}\.\d{2}\.\d{2}\.\d{2}/;

// Vorbemerkungen (preamble) codes begin with an all-zero prefix that marks a
// general, non-item position. The prefix is editioned — change it here if a tender
// uses a different convention; a non-matching preamble simply routes through the
// generic section path instead.
const VORBEMERKUNGEN_PREFIX = "00.00.00";
export const OZ_VORBEMERKUNGEN_RE = new RegExp(
  `${VORBEMERKUNGEN_PREFIX.replace(/\./g, "\\.")}\\.\\d{2}\\.\\d{2}`,
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
