import type { Logger } from "pino";
import {
  LlmExtractionArraySchema,
  LlmExtractionItemSchema,
  type LlmExtractionItem,
} from "../schemas/requirement.js";
import type { Chunk } from "../types/chunk.js";
import type { ChunkExtraction } from "../types/requirement.js";

// Attach chunker-supplied metadata (chunk/file/page/position/category) to the
// validated model content; the chunker is authoritative for it.
function enrich(item: LlmExtractionItem, chunk: Chunk): ChunkExtraction {
  return {
    chunk_id: chunk.chunk_id,
    source_file: chunk.source_file,
    page_number: chunk.page_number,
    section_heading: chunk.section_heading,
    bullet_point: item.bullet_point,
    description_en: item.description_en,
    description_de: item.description_de,
    priority: item.priority,
    equivalence_allowed: item.equivalence_allowed,
    confidence: item.confidence,
    standards: item.standards,
    referenced_annexes: item.referenced_annexes,
    cross_referenced_positions: item.cross_referenced_positions,
    category_code: chunk.category_code ?? item.category_code,
    item_number: chunk.lv_position ?? item.item_number,
    source_language: item.source_language ? item.source_language.toLowerCase().slice(0, 2) : null,
  };
}

// Tier 1: validate the whole array of model items, then enrich. Returns [] (rather
// than throwing) so the caller can fall through to per-item recovery.
export function validateExtractions(
  rawItems: unknown[],
  chunk: Chunk,
  log: Logger,
): ChunkExtraction[] {
  const result = LlmExtractionArraySchema.safeParse(rawItems);
  if (result.success) {
    return result.data.map((item) => enrich(item, chunk));
  }
  log.warn(
    {
      chunk_id: chunk.chunk_id,
      source_file: chunk.source_file,
      issues: result.error.issues.length,
    },
    "Tier 1 validation failed — entering Tier 2 per-item recovery",
  );
  return [];
}

// Tier 2: keep whatever individual items are well-formed and drop the rest. A
// single malformed item should not discard the good requirements beside it.
export function recoverPartialExtractions(
  rawItems: unknown[],
  chunk: Chunk,
  log: Logger,
): ChunkExtraction[] {
  const recovered: ChunkExtraction[] = [];
  for (const item of rawItems) {
    const result = LlmExtractionItemSchema.safeParse(item);
    if (result.success) recovered.push(enrich(result.data, chunk));
  }
  if (recovered.length > 0) {
    log.warn(
      {
        chunk_id: chunk.chunk_id,
        source_file: chunk.source_file,
        recovered: recovered.length,
        of: rawItems.length,
      },
      "Tier 2 partial recovery succeeded",
    );
  }
  return recovered;
}
