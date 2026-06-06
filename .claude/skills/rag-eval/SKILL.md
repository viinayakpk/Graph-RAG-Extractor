---
name: rag-eval
description: Set up or run evaluation for the Graph-RAG-Extractor pipeline. Covers extraction quality (recall, precision), consolidation quality (deduplication accuracy), and retrieval quality (faithfulness, citation completeness). Use when building the eval harness or interpreting results.
---

# RAG Evaluation

Design or run evaluation for the tender extraction pipeline.

## Three Evaluation Targets

### 1. Extraction Quality (per-chunk)
Measures: does the LLM correctly extract requirements from a chunk?

Metrics:
- **Field recall**: fraction of expected fields present and non-null in the output
- **Priority accuracy**: does the extracted `priority` match the annotated ground truth?
- **Equivalence flag accuracy**: is `equivalence_allowed` correctly detected?
- **False positive rate**: requirements extracted that don't exist in the source chunk

Ground truth format (`eval/ground_truth.json`):
```json
[
  {
    "chunk_id": "...",
    "source_file": "...",
    "expected_requirements": [
      { "item_number": "1.1", "priority": "must", "equivalence_allowed": false }
    ]
  }
]
```

### 2. Consolidation Quality (cross-document)
Measures: does the consolidator correctly merge duplicate requirements?

Metrics:
- **Deduplication precision**: fraction of merged pairs that are truly the same requirement
- **Deduplication recall**: fraction of true duplicates that were successfully merged
- **Source preservation**: after merge, are both original `chunk_id` values retained?

### 3. Retrieval Quality (end-to-end)
Measures: does the RAG layer return the right requirements for a query?

Metrics:
- **Recall@k**: fraction of relevant requirements in the top-k retrieved
- **Faithfulness**: does the generated answer only use retrieved content (no hallucination)?
- **Citation completeness**: does every statement in the answer cite a `chunk_id` + `page_number`?

## Evaluation Process

1. Read `eval/ground_truth.json` (create it if missing — start with 3–5 manually annotated examples per tender file).
2. Run the pipeline component being evaluated.
3. Compare output against ground truth using the metrics above.
4. Report results as a table: metric | score | notes.
5. Flag the single biggest failure mode for the next iteration.

## Rules

- Never hallucinate eval results. If ground truth is missing, say so and help create it.
- Start small: 5 annotated chunks per document is enough for the first pass.
- Evaluation is only meaningful if `raw_text` traceability is present in every extraction.
