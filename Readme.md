# Procurement Tender Extractor

Reads a procurement tender's PDF(s) and extracts **every requirement** into one faithful, three-level `ProcurementMatchDeliverable` tree per tender — pulling pieces of the same requirement that are scattered across the document onto a single leaf, and grounding every leaf back to its source text.

## Run it (Docker)

```bash
git clone <repo-url> && cd Graph-RAG-Extractor

cp .env.example .env          # Windows: copy .env.example .env
#  edit .env -> set DEEPSEEK_API_KEY=...

mkdir pdfs                    # put your tender PDF(s) in ./pdfs
docker compose up --build
```

That builds the image and runs the whole pipeline on **every PDF in `./pdfs`** (each PDF = one tender). Results land in `./outputs/<tender>/` — the deliverable is `tree.json`, alongside `consolidated.json` and `chunks.json`.

A committed real run on the three sample tenders is in **[`sample-output/`](sample-output/)**, so the output can be reviewed without running anything.

> Without Docker: Node 20.6+ , then `npm install` and `npm start -- --pdf "path/to/Tender.pdf"`.

## What it does

A six-stage pipeline — `profiler → parser → chunker → extractor → consolidator → builder`:

- **Geometry-first parsing** — rebuilds text lines from each glyph's x/y/font-size (not a flattened character stream), so structure survives for any layout.
- **Structure-aware chunking** — segments the page the way a person reads it (headings, labelled items); LV position codes are recognised but a generic path handles any format.
- **Extraction (DeepSeek + Zod)** — pulls requirement content in any language (English + verbatim original), validated at the boundary; over-dense blocks are split so nothing is dropped, and a second pass gleans anything missed.
- **Consolidation** — union-find merges the same requirement split across pages; a category pass and an LLM-discriminator-gated semantic link pull scattered pieces onto one leaf, built so two distinct priced positions can never be fused.
- **Faithfulness** — every numeric value in a leaf is checked against its source; anything untraceable drops `confidence` to `low`. The exact source is preserved under the original-language key.
- **Grouping** — an L1/L2 taxonomy is induced from the document's own categories, so it is stable and scales to thousands of leaves.

Each leaf matches the `ProcurementMatchDeliverable` interface exactly: `bulletPoint`, locale `description` (e.g. `{ en, de }`), `priority`, `confidence`, `equivalenceAllowed`, and `procurementDocumentChunkIdArray`. Later-stage fields (`status`, `aiReasoning`, `feedback`, cited arrays, …) are set to their null/empty defaults; `fullfillable` is `null` because deciding it needs company-catalog matching, which is out of scope.

`eval/ground-truth/` holds a small **golden set** of facts hand-verified against the source PDFs (exact dimensions, quantities, standards, dates, the "or equivalent" flag) — the reference for checking extraction correctness.

## Known issues / limitations

- **English descriptions are model translations**, so a number could in principle drift; mitigations are the verbatim original (kept under its language key), the per-leaf source chunk IDs, and the number-grounding gate that flags untraceable values as `confidence: low`. Verify a figure against the verbatim or the cited chunk.
- **Cross-block semantic linking is partial** — "named on page 60, specified on page 382" is linked within a category/section; linking across distant sections of a very large tender (or across separate files by fuzzy similarity) is a planned embedding pass.
- **The recall second pass slightly over-nests** — a few near-duplicate prose leaves, a deliberate trade since "nothing dropped" outweighs tight nesting. Disable with `RECALL_GLEANER=0`.
- **Leaf count is faithful, not minimal** — a 400-page tender yields ~2,800 leaves because each priced position is its own deliverable; distinct line items are not compressed.
