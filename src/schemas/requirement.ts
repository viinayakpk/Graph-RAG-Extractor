import { z } from "zod";
import type { ConsolidatedRequirement } from "../types/requirement.js";

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

export const ConsolidatedRequirementSchema: z.ZodType<ConsolidatedRequirement> =
  z.object({
    id: z.string().min(1),
    source_chunk_ids: z.array(z.string()).min(1),
    merge_record: z.object({
      rule: z.enum([
        "lv-position-match",
        "vorbemerkungen-category",
        "staging-dedup",
        "semantic-link",
        "standalone",
      ]),
      mergeConfidence: z.enum(["high", "medium", "low"]),
      evidenceLinks: z.array(
        z.object({
          chunkId: z.string(),
          evidenceRole: z.enum([
            "general_spec",
            "room_placement",
            "quantity",
            "maintenance",
            "external_plan_reference",
            "standard_citation",
            "duplication",
            "cross_reference",
          ]),
        }),
      ),
      whyMerged: z.string(),
    }),
    bullet_point: z.string().min(3),
    description_en: z.string().min(5),
    description_de: z.string().nullable(),
    priority: z.enum(["must", "should", "optional"]),
    equivalence_allowed: z.boolean().nullable(),
    confidence: z.enum(["high", "medium", "low"]),
    standards: z.array(z.string()),
    referenced_annexes: z.array(z.string()),
    category_code: z.string().nullable(),
    section_heading: z.string().nullable(),
    item_number: z.string().nullable(),
    source_language: z.string().nullable(),
  });
