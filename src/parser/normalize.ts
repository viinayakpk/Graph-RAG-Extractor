// Unicode ligature map — fixes "installaon", "oﬃce", "eﬃcient"
const LIGATURES: Record<string, string> = {
  "ﬀ": "ff",
  "ﬁ": "fi",
  "ﬂ": "fl",
  "ﬃ": "ffi",
  "ﬄ": "ffl",
  "ﬅ": "st",
  "ﬆ": "st",
};

const LIGATURE_RE = new RegExp(Object.keys(LIGATURES).join("|"), "g");

const SALZBURG_COLUMN_NOISE = /EUR\s+(?:PP|EP|SO|ST)\s+EUR/g;
const LV_ORDINAL_NOISE = /\b\d+\.\d+\s+LO\b/g;

export function normalizePage(raw: string, repeatedHeaders: string[]): string {
  let text = raw;

  // 1. Ligature replacement
  text = text.replace(LIGATURE_RE, (char) => LIGATURES[char] ?? char);

  // 2. Strip repeated LV table header lines
  for (const header of repeatedHeaders) {
    text = text.replaceAll(header, "");
  }

  // 3. Strip Salzburg column noise
  text = text.replace(SALZBURG_COLUMN_NOISE, "").replace(LV_ORDINAL_NOISE, "");

  // 4. Normalize dashes, smart quotes, zero-width chars
  text = text
    .replace(/[–—]/g, "-")
    .replace(/[“”„]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[​‌‍﻿]/g, "");

  return text.trim();
}
