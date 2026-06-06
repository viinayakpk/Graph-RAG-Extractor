import type { Logger } from "pino";
import type { ChunkExtraction, MergeRecord } from "../../types/requirement.js";

// Rule 3: two extractions cite the same standard AND have identical bullet_point
// Treats them as the same requirement stated in different parts of the document
export function applySharedStandardRule(
  extractions: ChunkExtraction[],
  log: Logger
): Map<string, string[]> {
  // Key: "standard:bullet_point" → group
  const groups = new Map<string, ChunkExtraction[]>();

  for (const ext of extractions) {
    for (const std of ext.standards) {
      const key = `${std.toLowerCase()}:${ext.bullet_point.toLowerCase()}`;
      const group = groups.get(key) ?? [];
      group.push(ext);
      groups.set(key, group);
    }
  }

  const merges = new Map<string, string[]>();
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const canonical = group[0]!.chunk_id;
    const all = group.map((e) => e.chunk_id);
    merges.set(canonical, all);
    log.debug({ key, count: group.length, rule: "shared-standard" }, "Rule 3: shared-standard merge");
  }

  return merges;
}

export function sharedStandardMergeRecord(chunkIds: string[], standard: string): MergeRecord {
  return {
    rule: "standard-reference",
    mergeConfidence: "medium",
    evidenceLinks: chunkIds.map((id) => ({
      chunkId: id,
      evidenceRole: "standard_citation" as const,
    })),
    whyMerged: `Same requirement citing standard ${standard} found in multiple document locations`,
  };
}
