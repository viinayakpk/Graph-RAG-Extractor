import type { Logger } from "pino";
import { ChunkExtractionArraySchema } from "../schemas/requirement.js";
import type { ChunkExtraction } from "../types/requirement.js";

// Placeholder inserted when all recovery tiers fail — never silently drops a chunk
export function makePlaceholder(chunkId: string, sourceFile: string): ChunkExtraction {
  return {
    chunk_id: chunkId,
    source_file: sourceFile,
    page_number: "unknown",
    section_heading: null,
    bullet_point: `LOW_CONFIDENCE_PLACEHOLDER: ${chunkId}`,
    description_en: "Extraction failed after all recovery attempts. Manual review required.",
    description_de: null,
    priority: "must",
    equivalence_allowed: null,
    confidence: "low",
    standards: [],
    referenced_annexes: [],
    cross_referenced_positions: [],
    category_code: null,
    item_number: null,
  };
}

// Tier 1: validate full LLM response as ChunkExtraction[]
export function validateExtractions(
  raw: unknown,
  chunkId: string,
  sourceFile: string,
  log: Logger
): ChunkExtraction[] {
  try {
    const parsed = ChunkExtractionArraySchema.parse(raw);
    return parsed.map((e) => ({ ...e, chunk_id: chunkId, source_file: sourceFile }));
  } catch (err) {
    log.warn(
      { chunk_id: chunkId, source_file: sourceFile, err },
      "Zod validation failed on full response — entering Tier 2 recovery"
    );
    return [];
  }
}

// Tier 2: attempt to pull any valid items from a possibly-partial array
export function recoverPartialExtractions(
  items: unknown[],
  chunkId: string,
  sourceFile: string,
  log: Logger
): ChunkExtraction[] {
  const recovered: ChunkExtraction[] = [];
  for (const item of items) {
    try {
      const parsed = ChunkExtractionArraySchema.parse([item]);
      recovered.push({ ...parsed[0]!, chunk_id: chunkId, source_file: sourceFile });
    } catch {
      // skip invalid items
    }
  }
  if (recovered.length > 0) {
    log.warn(
      { chunk_id: chunkId, source_file: sourceFile, recovered: recovered.length },
      "Tier 2 partial recovery succeeded"
    );
  }
  return recovered;
}
