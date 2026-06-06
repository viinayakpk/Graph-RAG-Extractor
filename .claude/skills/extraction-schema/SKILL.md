---
name: extraction-schema
description: Design or validate the Zod schema used to extract requirement candidates from tender chunks via DeepSeek. Use before writing any LLM extraction code, or when the schema needs updating.
---

# Extraction Schema Designer / Validator

Design or validate the Zod schema for extracted tender requirement candidates in `src/schemas/`.

## Canonical Zod Schema

Every object the DeepSeek API returns for a chunk must conform to this shape before entering the consolidator. This is the *candidate* shape — not the final `ProcurementMatchDeliverable` (which lives in `src/schemas/procurement.ts`).

```typescript
// src/schemas/extraction.ts
import { z } from "zod";

export const ChunkExtractionSchema = z.object({
  chunk_id:           z.string().min(1),
  source_file:        z.string().min(1),
  page_number:        z.union([z.number().int(), z.string()]),
  section_heading:    z.string().nullable(),

  // Core requirement fields
  bullet_point:       z.string().min(3),
  description_en:     z.string().min(5),
  description_de:     z.string().nullable(),   // present when source text is German
  priority:           z.enum(["must", "should", "optional"]),
  equivalence_allowed: z.boolean().nullable(), // null when source is silent
  confidence:         z.enum(["high", "medium", "low"]),

  // Traceability
  raw_text:           z.string().min(10),   // verbatim source text this was extracted from
  item_number:        z.string().nullable(), // LV position number if present

  // Related entities for consolidation
  standards:          z.array(z.string()),
  referenced_annexes: z.array(z.string()),
});

export type ChunkExtraction = z.infer<typeof ChunkExtractionSchema>;

// An LLM call returns an array (empty array if no requirements found in chunk)
export const ChunkExtractionArraySchema = z.array(ChunkExtractionSchema);
```

## Validation Process

When given a raw DeepSeek API response:
1. Strip markdown fences if present (` ```json ... ``` `).
2. `JSON.parse()` the string — if it throws, log the raw string and re-throw with `chunk_id` context.
3. `ChunkExtractionArraySchema.parse(parsed)` — Zod throws `ZodError` on failure; do not swallow it.
4. Log: `[extractor] chunk ${chunk_id}: ${results.length} candidates extracted`.

## Design Guidance

When extending the schema:
- Add nullable fields — never make existing required fields optional.
- Every new field needs a `description` comment explaining what goes there.
- `raw_text` is non-negotiable — every candidate must cite its verbatim source.
- If a field is LV-document-specific (German procurement format), note it with a comment.

## Key Checks to Run

- [ ] `chunk_id` and `source_file` are non-empty strings — never null
- [ ] `priority` is strictly one of the three enum values (not "mandatory", not "required")
- [ ] `equivalence_allowed` is `true`/`false`/`null` — not `"yes"`/`"no"`/`""`
- [ ] `raw_text` contains text that actually appears in the chunk content
- [ ] `standards` and `referenced_annexes` are arrays even when empty (not null)
- [ ] When `description_de` is present, it is the German original; `description_en` is the translation

## Output

Either: the corrected/extended Zod schema, or a validation report — which fields pass/fail with specific examples from actual LLM output.
