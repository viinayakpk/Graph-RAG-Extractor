---
name: rag-architecture
description: Review and critique pipeline design decisions for the Graph-RAG-Extractor project — chunking strategy, extraction schema, consolidation logic, tree structure. Use before building or refactoring any pipeline layer.
---

# Pipeline Architecture Reviewer

Review a design decision for this tender extraction project (TypeScript/Node, DeepSeek, no graph DB required). Architecture is NOT yet finalised — surface tradeoffs, do not rubber-stamp choices.

## What to Review

Given a description of a proposed layer or design, evaluate on these dimensions:

### 1. Traceability (non-negotiable)
- Does every extracted item carry `chunk_id`, `page_number`, `source_file`?
- When candidates are merged into one `ProcurementMatchDeliverable` leaf, do ALL source `chunk_id` values survive in `procurementDocumentChunkIdArray`?
- Can the BOND assessor trace any L3 leaf back to the exact PDF page?

### 2. Chunk Quality for Tenders
- Are item numbers (e.g., "Pos. 1.1", "LV-Nr. 003") preserved as atomic units — never split mid-description?
- Are tables kept intact — not split mid-row across chunk boundaries?
- When a requirement says "see Annex 3", does the same chunk include that reference text so the consolidator can link it?
- Which Node.js PDF parser is being used, and has it been tested against the actual sample PDFs (some may be scanned — check before assuming OCR is not needed)?

### 3. Extraction Schema Soundness (Zod)
- Does `src/schemas/extraction.ts` capture: `bullet_point`, `description_en`, `description_de`, `priority`, `equivalence_allowed`, `confidence`, `raw_text`, `item_number`, `standards`, `referenced_annexes`?
- Is every DeepSeek response validated with `.parse()` before entering the consolidator?
- Is `raw_text` always verbatim source text — not a paraphrase?

### 4. Consolidation Logic (the hard part)
- What is the merge key? (item number match? heading context? normalized description similarity?)
- When two candidates from different pages/files refer to the same requirement, which fields win? Are ALL source `chunk_id` values collected into `procurementDocumentChunkIdArray`?
- Is rule-based consolidation implemented before embeddings? (correct order: rules first, embeddings as fallback)
- Give a false positive scenario: two candidates that could be incorrectly merged.

### 5. Tree Structure
- Do L1 nodes reflect actual top-level groupings in the tender — not invented categories?
- Is the tree 3 levels deep where the tender is detailed, shallower where it is not?
- Are L3 leaves the only nodes with non-empty `procurementDocumentChunkIdArray`?
- Is `deliverableArray` empty on all L3 leaves?

### 6. Assessment-Specific Fields
- Are the no-op fields set correctly: `status: "waitingForAnalysis"`, `aiReasoning: null`, `feedback: null`, `feedbackText: null`, `openQuestionId: null`, `workspaceDocumentChunkIdArray: []`, `citedProductIdArray: []`, `citedPersonIdArray: []`?

## Output

For each dimension: **Pass**, **Risk** (explain), or **N/A**. Then the top 2–3 open questions to answer before building.
