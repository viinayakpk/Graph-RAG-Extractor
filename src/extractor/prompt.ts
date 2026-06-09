import type { DocumentRegion } from "../types/chunk.js";

export const PROMPT_VERSION = "1.2";

// JSON shape the LLM must return — defined once, not repeated per document type
const EXTRACTION_SCHEMA = `Return a JSON object with key "extractions" containing an array of objects.
Each object must have:
- bullet_point: short imperative title (max 80 chars, English)
- description_en: full English description of this specific requirement
- description_de: original German text verbatim, or null if source is English
- priority: "must" | "should" | "optional"
- equivalence_allowed: true if "oder gleichwertig" / "or equivalent" is present, false if exact spec required, null if the source is silent
- confidence: "high" | "medium" | "low"
- standards: array of DIN/EN/ISO/ÖNORM codes referenced, empty array if none
- referenced_annexes: array of annex or plan references, empty array if none
- cross_referenced_positions: array of OZ position numbers explicitly mentioned, empty array if none
- category_code: string | null (see document context below)
- item_number: string | null (see document context below)`;

const BASE_INSTRUCTIONS = `You are a procurement analyst. Extract ALL requirements from the given text.
Do not skip requirements because they seem administrative or minor — extract everything the buyer is asking for.
Each distinct obligation becomes its own object in the array.
${EXTRACTION_SCHEMA}`;

// Structural guidance per document region — 2-4 lines, no schema duplication
const DOCUMENT_CONTEXT: Record<DocumentRegion, string> = {
  "lv-position": `This is an LV (Leistungsverzeichnis) position block identified by an OZ position code.
Set item_number to the full OZ code (e.g. "01.01.0010" or "GU.07.09.01.01").
For 5-segment Salzburg codes (e.g. GU.07.09.01.01) set category_code to the third segment ("09"). For numeric codes (e.g. 01.01.0010) set category_code to null.
Set equivalence_allowed to true when "oder gleichwertig" appears.`,

  "vorbemerkungen": `This is a Vorbemerkungen (preamble/general conditions) block from an Austrian LV tender, identified by OZ code 00.00.00.KK.II.
These are general specifications that apply to all room positions in category KK.
Set category_code to the KK segment (e.g. "09" from 00.00.00.09.01). Set item_number to null.
Expect 2–6 distinct requirements per block — do not merge separate obligations into one entry.`,

  "section": `This is a section from a procurement tender document.
Set item_number to the numbered item identifier if the text uses a numbered list (e.g. "3" for item 3), otherwise null.
Set category_code to null.`,
};

export function buildSystemPrompt(region: DocumentRegion): string {
  return `${BASE_INSTRUCTIONS}\n\n## Document context\n${DOCUMENT_CONTEXT[region]}`;
}
