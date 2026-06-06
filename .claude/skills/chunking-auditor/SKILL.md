---
name: chunking-auditor
description: Audit the quality of chunks produced by the chunking layer for procurement tender documents. Use after implementing or modifying the chunker to verify structural integrity.
---

# Chunking Auditor

Audit the chunking output for tender/procurement documents. The chunker must preserve the structural elements that matter most in LV-style specifications.

## Input Expected

Either:
- A path to a chunked output file (JSON), or
- A TypeScript code snippet of the chunker implementation (`src/chunker/`)

## What to Check

### 1. Item Number Integrity
- Does each chunk contain at most one LV item number (e.g., "Pos. 1.1", "LV-Nr. 003")?
- Are item numbers never split mid-description across two chunks?
- Test: search for item numbers in the output and verify the full description follows in the same chunk.

### 2. Table Integrity
- Are tables kept as single atomic chunks?
- Do column headers appear in the same chunk as their rows?
- Are quantity + unit columns never separated from the item they describe?

### 3. Annex Cross-Reference Preservation
- When a requirement says "see Annex 3" or "refer to table 4.2", does the same chunk include that reference text?
- Can the consolidation layer later link that chunk to the annex without losing context?

### 4. Chunk Metadata Completeness
Each chunk object must have:
```json
{
  "chunk_id": "string — unique, stable",
  "source_file": "filename",
  "page_number": "int or range",
  "section_heading": "string or null",
  "content": "string"
}
```
Flag any missing fields.

### 5. Size Compliance
- Chunks should be 300–1200 tokens for this domain (tender specs are dense).
- Flag chunks below 50 tokens (likely noise) or above 2000 tokens (likely unsplit table).

### 6. Heading Propagation
- Does each chunk know its parent section heading?
- Heading context is needed for the LLM extractor to understand "this is the fume cupboard section."

## Chunk TypeScript Type (what the chunker must emit)

```typescript
// src/types/chunk.ts
export interface Chunk {
  chunk_id: string;        // stable, unique — e.g. "<source_file>__p<page>__<index>"
  source_file: string;     // filename only, not full path
  page_number: number | string;
  section_heading: string | null;
  content: string;
}
```

## Output

For each check: Pass / Fail / Warning with a specific example from the actual output. If failing, suggest the minimal fix to the TypeScript chunker code (`src/chunker/`).
