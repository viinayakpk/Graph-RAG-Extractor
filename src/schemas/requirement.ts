import { z } from "zod";
import type { ChunkExtraction, ConsolidatedRequirement } from "../types/requirement.js";

export const ChunkExtractionSchema: z.ZodType<ChunkExtraction> = z.object({
  chunk_id: z.string().min(1),
  source_file: z.string().min(1),
  page_number: z.union([z.number().int().positive(), z.string().min(1)]),
  section_heading: z.string().nullable(),
  bullet_point: z.string().min(3),
  description_en: z.string().min(5),
  description_de: z.string().nullable(),
  priority: z.enum(["must", "should", "optional"]),
  equivalence_allowed: z.boolean().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  standards: z.array(z.string()),
  referenced_annexes: z.array(z.string()),
  cross_referenced_positions: z.array(z.string()),
  category_code: z.string().nullable(),
  item_number: z.string().nullable(),
});

export const ChunkExtractionArraySchema = z.array(ChunkExtractionSchema);

export const ConsolidatedRequirementSchema: z.ZodType<ConsolidatedRequirement> =
  z.object({
    id: z.string().min(1),
    source_chunk_ids: z.array(z.string()).min(1),
    merge_record: z.object({
      rule: z.enum([
        "cross-reference",
        "lv-position-match",
        "vorbemerkungen-category",
        "standard-reference",
        "staging-dedup",
        "embedding-similarity",
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
  });
