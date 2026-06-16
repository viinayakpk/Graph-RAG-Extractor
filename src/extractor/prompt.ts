import type { DocumentRegion } from "../types/chunk.js";

export const PROMPT_VERSION = "2.0";

// The fields the model returns — requirement *content* only. Structural metadata
// (which chunk / page / position / category) is authoritative from the chunker
// and attached during enrichment, so it is not requested here.
const EXTRACTION_SCHEMA = `Return a JSON object with key "extractions": an array of objects.
Each object has:
- bullet_point: a short imperative title in English (max 80 chars)
- description_en: a full English description of this single requirement
- description_de: the requirement's text verbatim in the document's original language, or null if the source is already English
- priority: "must" (mandatory — must / shall / required / has to), "should" (recommended), or "optional" (may / nice to have)
- equivalence_allowed: true if an equivalent is explicitly accepted (e.g. "or equivalent", "oder gleichwertig", "ou équivalent", "o equivalente"), false if an exact product or spec is mandated, null if the source is silent
- confidence: "high" | "medium" | "low" (use "low" when the requirement depends on an external drawing or annex you cannot see)
- standards: array of referenced standard codes (e.g. DIN, EN, ISO, ÖNORM, ASTM, BS), [] if none
- referenced_annexes: array of annex / plan / drawing references named in the text (e.g. "Annex A", "Ansicht [B]"), [] if none
- cross_referenced_positions: array of other item / position codes the text explicitly names, [] if none
- category_code: null unless the text itself states a category code
- item_number: the item / position number if this block is a labelled item, otherwise null
- source_language: the ISO 639-1 code of the document's original language (e.g. "en", "de", "fr", "it", "es")`;

const BASE_INSTRUCTIONS = `You are a procurement analyst extracting what a buyer requires from a tender, in any language.
Extract EVERY requirement, specification, and obligation — administrative and technical alike; do not skip ones that seem minor.
Each distinct obligation becomes its own object. Write bullet_point and description_en in English; keep the original wording in description_de.
If the text contains no actual requirement (a heading, a table of contents, a form field, pricing boilerplate), return an empty "extractions" array.
${EXTRACTION_SCHEMA}`;

// Light, language-neutral guidance on how finely to split, by structural region.
const DOCUMENT_CONTEXT: Record<DocumentRegion, string> = {
  "lv-position": `This block is one line item / position: a primary deliverable plus its specifications. Extract the primary requirement and any distinct sub-obligations it states.`,
  "vorbemerkungen": `This block is a general / preamble specification that applies to many items. Extract each distinct technical requirement as its own object — expect several.`,
  "section": `This block is a section of prose or a numbered item. Extract each distinct obligation it contains.`,
};

export function buildSystemPrompt(region: DocumentRegion): string {
  return `${BASE_INSTRUCTIONS}\n\n## This block\n${DOCUMENT_CONTEXT[region]}`;
}

// Second-pass "gleaner" for recall: re-read the same block having seen the first
// pass's titles, and surface only obligations genuinely present in the text but
// missing from that list. Multi-pass extraction is the standard high-recall
// technique; the strict "only what is literally in the text, else empty" framing
// plus downstream Zod validation and number-grounding keep it from inventing.
const GLEANER_INSTRUCTIONS = `You are a procurement analyst re-checking a tender block for COMPLETENESS, in any language.
A first pass already extracted requirements from this block; its bullet_points are listed below under "Already extracted".
Return ONLY obligations or specifications that are genuinely stated in the block text but are MISSING from that list.
Do NOT restate, rephrase, translate, or split items already listed. Do NOT add anything not literally supported by the text.
If the first pass already captured everything, return an empty "extractions" array — that is the expected answer for most blocks.
${EXTRACTION_SCHEMA}`;

export function buildGleanerPrompt(region: DocumentRegion): string {
  return `${GLEANER_INSTRUCTIONS}\n\n## This block\n${DOCUMENT_CONTEXT[region]}`;
}
