---
name: structured-output-validator
description: Validate DeepSeek API JSON output against the project's Zod extraction schema before it enters the consolidator. Use when implementing or debugging the extraction layer to catch LLM JSON drift early.
---

# Structured Output Validator

Validate that a DeepSeek API response conforms to `src/schemas/extraction.ts` before being passed to the consolidator.

## What LLM JSON Drift Looks Like

Common failure modes to catch and handle:

| Failure | Example | Fix |
|---|---|---|
| Markdown fences | ` ```json\n[...]\n``` ` | Strip before `JSON.parse()` |
| Enum violation | `priority: "mandatory"` | Reject — cannot safely coerce |
| Wrong boolean type | `equivalence_allowed: "yes"` | Reject — cannot safely coerce |
| Single object not array | `{...}` instead of `[{...}]` | Wrap in array (safe coercion) |
| Null instead of empty array | `standards: null` | Coerce to `[]` (safe) |
| Missing `raw_text` | field absent | Reject — no traceability without it |
| `raw_text` is a paraphrase | "The document says there should be..." | Flag as low confidence, do not reject |
| `chunk_id` mismatch | ID from a different chunk | Reject and log — data integrity failure |

## Validation Function (TypeScript)

```typescript
import { ChunkExtractionArraySchema } from "../schemas/extraction.js";
import type { ChunkExtraction } from "../schemas/extraction.js";

export function validateExtractionOutput(
  raw: string,
  expectedChunkId: string,
  log: Logger
): ChunkExtraction[] {
  // 1. Strip markdown fences
  const cleaned = raw.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();

  // 2. Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    log.error({ chunk_id: expectedChunkId, raw: cleaned.slice(0, 200) }, "JSON.parse failed");
    throw err;
  }

  // 3. Normalise: single object → array
  const asArray = Array.isArray(parsed) ? parsed : [parsed];

  // 4. Coerce safe fields before Zod parse
  const coerced = asArray.map((item: Record<string, unknown>) => ({
    ...item,
    standards: item.standards ?? [],
    referenced_annexes: item.referenced_annexes ?? [],
  }));

  // 5. Zod parse — throws ZodError with field-level detail
  const results = ChunkExtractionArraySchema.parse(coerced);

  // 6. Check chunk_id integrity
  for (const r of results) {
    if (r.chunk_id !== expectedChunkId) {
      log.warn({ expected: expectedChunkId, got: r.chunk_id }, "chunk_id mismatch in extraction output");
    }
  }

  log.info({ chunk_id: expectedChunkId, count: results.length }, "extraction validated");
  return results;
}
```

## What NOT to Coerce Silently

- **Enum values** — `"mandatory"` is not `"must"`. Reject and fix the prompt.
- **Missing required fields** — `raw_text` absent means the LLM ignored the instruction. Fix the prompt, not the validator.
- **Wrong numeric types** — if `page_number` comes back as `"page 12"`, fix the prompt to return integers.

## Debugging Steps When Validation Fails

1. Log the full raw string at `debug` level (truncated to 500 chars in `warn`/`error`).
2. Check if the prompt has the JSON schema embedded — if not, the LLM has nothing to conform to.
3. Check temperature — should be 0 or 0.1 for structured extraction.
4. If enum violation: add few-shot examples of correct enum values to the prompt.
5. If `raw_text` is missing: make it a separate instruction line in the system prompt, not buried in the schema comment.

## Output

A validation report: total items, valid count, invalid count, each failure with field name + expected type + actual value received.
