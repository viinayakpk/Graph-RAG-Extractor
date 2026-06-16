// Zod schemas for the LLM extraction contract and the on-disk extraction cache.
import { z } from "zod";

// What the model is asked to return — requirement content only. Structural metadata
// is attached from the chunker afterward; arrays/optional fields default when omitted.
export const LlmExtractionItemSchema = z.object({
  bullet_point: z.string().min(3),
  description_en: z.string().min(5),
  description_de: z.string().nullable().default(null),
  priority: z.enum(["must", "should", "optional"]),
  equivalence_allowed: z.boolean().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  standards: z.array(z.string()).default([]),
  referenced_annexes: z.array(z.string()).default([]),
  cross_referenced_positions: z.array(z.string()).default([]),
  category_code: z.string().nullable().default(null),
  item_number: z.string().nullable().default(null),
  source_language: z.string().nullable().default(null),
});

export const LlmExtractionArraySchema = z.array(LlmExtractionItemSchema);
export type LlmExtractionItem = z.infer<typeof LlmExtractionItemSchema>;

// Enriched extraction (model content + chunker metadata). Validates cache reads so a
// stale or corrupt cache file is rejected rather than flowing into the tree.
export const ChunkExtractionSchema =
  LlmExtractionItemSchema.extend({
    chunk_id: z.string().min(1),
    source_file: z.string().min(1),
    page_number: z.union([z.number().int().positive(), z.string().min(1)]),
    section_heading: z.string().nullable(),
  });

export const ChunkExtractionArraySchema = z.array(ChunkExtractionSchema);
