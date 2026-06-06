import type { Logger } from "pino";
import type { ChunkExtraction, MergeRecord } from "../../types/requirement.js";

// Rule 1: same item_number in different chunks (same OZ position split across pages)
export function applyExactMatchRule(
  extractions: ChunkExtraction[],
  log: Logger
): Map<string, string[]> {
  const byOz = new Map<string, ChunkExtraction[]>();

  for (const ext of extractions) {
    if (!ext.item_number) continue;
    const group = byOz.get(ext.item_number) ?? [];
    group.push(ext);
    byOz.set(ext.item_number, group);
  }

  const merges = new Map<string, string[]>();
  for (const [oz, group] of byOz) {
    if (group.length < 2) continue;
    const canonical = group[0]!.chunk_id;
    const secondaries = group.slice(1).map((e) => e.chunk_id);
    merges.set(canonical, [canonical, ...secondaries]);
    log.debug({ oz, canonical, count: group.length, rule: "exact-match" }, "Rule 1: exact OZ match");
  }

  return merges;
}

export function exactMatchMergeRecord(chunkIds: string[], oz: string): MergeRecord {
  return {
    rule: "lv-position-match",
    mergeConfidence: "high",
    evidenceLinks: chunkIds.map((id, i) => ({
      chunkId: id,
      evidenceRole: i === 0 ? "general_spec" : "duplication",
    })),
    whyMerged: `Same OZ position ${oz} appears in multiple chunks (multi-page split)`,
  };
}
