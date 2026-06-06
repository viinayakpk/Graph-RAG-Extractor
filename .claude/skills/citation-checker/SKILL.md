---
name: citation-checker
description: Verify that every extracted requirement in the Graph-RAG-Extractor pipeline can be traced back to its source document, page, and chunk. Use after any extraction run or before submitting the assessment to confirm full traceability.
---

# Citation Checker

Verify end-to-end source traceability for all extracted requirements.

## Why This Matters

Every requirement in the output must be traceable to:
1. A specific `source_file` (which tender document)
2. A specific `page_number` (or page range)
3. A specific `chunk_id` (the exact chunk the LLM saw)
4. A `raw_text` field containing the verbatim source text

If any of these are missing, the extraction is unverifiable and the pipeline fails its core requirement.

## Traceability Checks

### Level 1 — Field Presence
For each extracted requirement:
- [ ] `chunk_id` is non-null and non-empty
- [ ] `source_file` matches an actual file in `Task and files/`
- [ ] `page_number` is set (integer or string range like "12-13")
- [ ] `raw_text` is non-null and at least 10 characters

### Level 2 — Content Match
For a sample of 10 requirements (or all if fewer than 10):
- [ ] `raw_text` appears verbatim (or near-verbatim) in the original chunk content
- [ ] `chunk_id` refers to a real chunk in the chunker output
- [ ] If `item_number` is set, that item number appears in the `raw_text`

### Level 3 — Graph Traceability
If the consolidation graph is built:
- [ ] Every `Requirement` node has at least one `SOURCED_FROM` edge to a chunk node
- [ ] Merged/deduplicated requirements have `SOURCED_FROM` edges to ALL original source chunks
- [ ] No orphan `Requirement` nodes (nodes with no `SOURCED_FROM` edges)

### Level 4 — Cross-Document Integrity
When a requirement was consolidated from multiple files:
- [ ] The merged node lists all contributing `source_file` values
- [ ] The merged node lists all contributing `chunk_id` values
- [ ] The primary `raw_text` is from the most authoritative source (main LV over annex)

## Audit Process

1. Load the extraction output (JSON or graph).
2. Run checks Level 1–2 programmatically; report counts.
3. For Level 3–4, run the Cypher queries:
   ```cypher
   // Find orphan requirements
   MATCH (r:Requirement) WHERE NOT (r)-[:SOURCED_FROM]->() RETURN r.item_number, r.description

   // Find requirements missing source_file
   MATCH (r:Requirement) WHERE r.source_file IS NULL RETURN r
   ```
4. Report: total requirements, fully traceable, partially traceable (missing some fields), untraceable.

## Output

Summary table + list of any failures with the specific requirement and which check failed.
