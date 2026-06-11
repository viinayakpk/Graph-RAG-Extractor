import { z } from "zod";
import type { ConsolidatedRequirement } from "../types/requirement.js";

// What the DeepSeek prompt (extractor/prompt.ts) actually asks the model to
// return: requirement *content* only. Structural metadata — chunk_id,
// source_file, page_number, section_heading — is NOT requested from the model;
// it is authoritative from the chunker and attached during enrichment. Validating
// those fields against the model's output would reject every well-formed response
// (the model is never even shown the chunk_id). The arrays and the optional German
// text default when omitted, so a response missing only an optional field is kept
// rather than discarded.
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
});

export const LlmExtractionArraySchema = z.array(LlmExtractionItemSchema);
export type LlmExtractionItem = z.infer<typeof LlmExtractionItemSchema>;

// The enriched extraction = validated model content + chunker-supplied metadata.
// Used to validate cache reads, so a stale or corrupt cache file is rejected and
// re-extracted rather than silently flowing into the tree. Inferred (not annotated
// with z.ZodType<ChunkExtraction>) because the array/text defaults above make the
// *input* type optional; the parsed *output* is exactly ChunkExtraction, which the
// cache read site enforces.
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
        "cross-reference",
        "lv-position-match",
        "vorbemerkungen-category",
        "standard-reference",
        "staging-dedup",
        "embedding-similarity",
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
  });
