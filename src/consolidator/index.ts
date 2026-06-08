import type { Logger } from "pino";
import type { ChunkExtraction, ConsolidatedRequirement } from "../types/requirement.js";
import { applyCrossReferenceRule, crossReferenceMergeRecord } from "./rules/cross-reference.js";
import { applyExactMatchRule, exactMatchMergeRecord } from "./rules/exact-match.js";
import { applyPreambleCategoryRule, preambleCategoryMergeRecord } from "./rules/preamble-category.js";
import { applySharedStandardRule, sharedStandardMergeRecord } from "./rules/shared-standard.js";
import { applyDedupRule, dedupMergeRecord } from "./rules/dedup.js";
import { applySimilarityRule } from "./similarity.js";

function mergeGroup(
  canonicalId: string,
  allIds: string[],
  byChunkId: Map<string, ChunkExtraction[]>
): { sources: ChunkExtraction[]; chunkIds: string[] } {
  const sources: ChunkExtraction[] = [];
  for (const id of allIds) {
    const exts = byChunkId.get(id) ?? [];
    sources.push(...exts);
  }
  return { sources, chunkIds: allIds };
}

function pickBest(extractions: ChunkExtraction[]): ChunkExtraction {
  const byConfidence = { high: 3, medium: 2, low: 1 } as const;
  return [...extractions].sort(
    (a, b) => byConfidence[b.confidence] - byConfidence[a.confidence]
  )[0]!;
}

export async function consolidate(
  extractions: ChunkExtraction[],
  log: Logger
): Promise<ConsolidatedRequirement[]> {
  log.info({ input: extractions.length }, "starting consolidation");

  const byChunkId = new Map<string, ChunkExtraction[]>();
  for (const ext of extractions) {
    const list = byChunkId.get(ext.chunk_id) ?? [];
    list.push(ext);
    byChunkId.set(ext.chunk_id, list);
  }

  const mergedChunkIds = new Set<string>();
  const consolidatedMap = new Map<string, ConsolidatedRequirement>();

  function applyMerges(
    mergeGroups: Map<string, string[]>,
    buildRecord: (ids: string[], ext: ChunkExtraction) => ReturnType<typeof crossReferenceMergeRecord>
  ) {
    for (const [canonical, allIds] of mergeGroups) {
      if (allIds.some((id) => mergedChunkIds.has(id))) continue; // don't re-merge

      const { sources, chunkIds } = mergeGroup(canonical, allIds, byChunkId);
      if (sources.length === 0) continue;

      const best = pickBest(sources);
      const record = buildRecord(chunkIds, best);

      consolidatedMap.set(canonical, {
        id: canonical,
        source_chunk_ids: chunkIds,
        merge_record: record,
        bullet_point: best.bullet_point,
        description_en: best.description_en,
        description_de: best.description_de,
        priority: best.priority,
        equivalence_allowed: best.equivalence_allowed,
        confidence: best.confidence,
        standards: [...new Set(sources.flatMap((s) => s.standards))],
        referenced_annexes: [...new Set(sources.flatMap((s) => s.referenced_annexes))],
        category_code: best.category_code,
        section_heading: best.section_heading,
        item_number: best.item_number,
      });

      for (const id of chunkIds) mergedChunkIds.add(id);
    }
  }

  // Rule 0: explicit OZ cross-references
  const crossRefMerges = applyCrossReferenceRule(extractions, log);
  applyMerges(crossRefMerges, (ids, best) =>
    crossReferenceMergeRecord(
      ids[0]!,
      ids,
      best.cross_referenced_positions[0] ?? ""
    )
  );

  // Rule 1: exact OZ position match (multi-page splits)
  const exactMerges = applyExactMatchRule(extractions, log);
  applyMerges(exactMerges, (ids, best) =>
    exactMatchMergeRecord(ids, best.item_number ?? "unknown")
  );

  // Rule 2: preamble category → room positions (Salzburg)
  const preambleMerges = applyPreambleCategoryRule(extractions, log);
  applyMerges(preambleMerges, (ids, best) => {
    const preambleIds = ids.filter((id) => {
      const exts = byChunkId.get(id) ?? [];
      return exts.some((e) => !e.item_number);
    });
    const positionIds = ids.filter((id) => !preambleIds.includes(id));
    return preambleCategoryMergeRecord(ids, best.category_code ?? "unknown", preambleIds, positionIds);
  });

  // Rule 3: shared standard reference
  const standardMerges = applySharedStandardRule(extractions, log);
  applyMerges(standardMerges, (ids, best) =>
    sharedStandardMergeRecord(ids, best.standards[0] ?? "unknown")
  );

  // Rule 4: staging dedup
  const dedupMerges = applyDedupRule(extractions, mergedChunkIds, log);
  applyMerges(dedupMerges, (ids) => dedupMergeRecord(ids));

  // Rule 5: optional embedding similarity
  const similarityMerges = await applySimilarityRule(extractions, log);
  applyMerges(similarityMerges, (ids) => ({
    rule: "embedding-similarity",
    mergeConfidence: "low",
    evidenceLinks: ids.map((id) => ({ chunkId: id, evidenceRole: "duplication" as const })),
    whyMerged: "Embedding cosine similarity above threshold",
  }));

  // Any extraction not merged by any rule → standalone requirement
  for (const ext of extractions) {
    if (mergedChunkIds.has(ext.chunk_id)) continue;
    if (consolidatedMap.has(ext.chunk_id)) continue;

    consolidatedMap.set(ext.chunk_id, {
      id: ext.chunk_id,
      source_chunk_ids: [ext.chunk_id],
      merge_record: {
        rule: "staging-dedup",
        mergeConfidence: ext.category_code ? "medium" : "high",
        evidenceLinks: [{ chunkId: ext.chunk_id, evidenceRole: "general_spec" }],
        whyMerged: "Standalone requirement — no merge candidates found",
      },
      bullet_point: ext.bullet_point,
      description_en: ext.description_en,
      description_de: ext.description_de,
      priority: ext.priority,
      equivalence_allowed: ext.equivalence_allowed,
      confidence: ext.confidence,
      standards: ext.standards,
      referenced_annexes: ext.referenced_annexes,
      category_code: ext.category_code,
      section_heading: ext.section_heading,
      item_number: ext.item_number,
    });
  }

  const results = [...consolidatedMap.values()];
  log.info(
    { input: extractions.length, output: results.length, merged: extractions.length - results.length },
    "consolidation complete"
  );
  return results;
}
