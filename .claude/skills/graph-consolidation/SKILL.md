---
name: graph-consolidation
description: Design or review the Neo4j or FalkorDB graph schema for consolidating and deduplicating tender requirements across multiple documents and annexes. Use before implementing the consolidation layer.
---

# Graph Consolidation Designer

Design or review the knowledge graph schema for consolidating procurement tender requirements.

## Context

The consolidation layer receives extracted requirements from multiple files (main LV, annexes, datasheets) and must:
1. Detect that two candidates refer to the same requirement
2. Merge them into a single graph node
3. Preserve both source chunk IDs as provenance
4. Link requirements to shared entities (standards, sections, annexes)

## Canonical Node Labels

```
Document      — one per input file
  ↓ HAS_SECTION
Section       — a top-level heading or chapter
  ↓ HAS_REQUIREMENT
Requirement   — a single extracted, deduplicated requirement
  ↓ REFERENCES
Standard      — e.g., "EN 14175", "DIN 4102"
  ↓ PART_OF
Annex         — e.g., "Annex 3 - Technical Specs"
```

## Canonical Relationship Types

| Relationship | From → To | Notes |
|---|---|---|
| `HAS_SECTION` | Document → Section | |
| `HAS_REQUIREMENT` | Section → Requirement | |
| `EQUIVALENT_TO` | Requirement → Requirement | bidirectional, used pre-merge |
| `REFERENCES` | Requirement → Standard | |
| `REFERENCES` | Requirement → Annex | |
| `SOURCED_FROM` | Requirement → Chunk | preserves chunk_id + page_number |
| `PART_OF` | Section → Section | for nested headings |

## Deduplication Logic to Review

When given a proposed consolidation approach, check:

1. **Merge key**: Is item_number used as primary key? If two candidates share the same item_number and source_file, they should merge. If they share item_number across different files, check description similarity first.
2. **Embedding threshold**: What cosine similarity threshold triggers a merge? 0.90 is a reasonable starting point for this domain — flag if it's lower.
3. **Provenance**: After merge, does the `Requirement` node have a `SOURCED_FROM` edge to *all* original chunks? If not, traceability is broken.
4. **False positive guard**: Same standard name in two unrelated sections should NOT trigger a merge. The deduplication key must be (item_number OR description similarity) AND same semantic context.

## Queries the Schema Must Support

Verify the schema can answer these without full-table scans:
```cypher
// All requirements referencing a specific standard
MATCH (r:Requirement)-[:REFERENCES]->(s:Standard {name: "EN 14175"}) RETURN r

// All requirements from a specific annex
MATCH (r:Requirement)-[:REFERENCES]->(a:Annex {name: "Annex 3"}) RETURN r

// Trace a requirement back to its source chunks
MATCH (r:Requirement {item_number: "1.1"})-[:SOURCED_FROM]->(c) RETURN c.chunk_id, c.page_number, c.source_file

// Find potential duplicates (high embedding similarity, different source files)
MATCH (r1:Requirement), (r2:Requirement)
WHERE r1.source_file <> r2.source_file AND r1.embedding IS NOT NULL
// ... vector similarity filter
```

## Output

A Cypher schema definition (CREATE CONSTRAINT + CREATE INDEX statements) and a review of the proposed consolidation logic against the checks above.
