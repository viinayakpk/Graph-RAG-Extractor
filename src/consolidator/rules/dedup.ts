import type { Logger } from "pino";
import type { ChunkExtraction, MergeRecord } from "../../types/requirement.js";

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

// Rule 4: staging dedup — after rules 0-3, catch any remaining extractions with
// identical normalized bullet_point (same requirement stated twice in same document)
export function applyDedupRule(
  extractions: ChunkExtraction[],
  alreadyMerged: Set<string>,
  log: Logger
): Map<string, string[]> {
  const unmerged = extractions.filter((e) => !alreadyMerged.has(e.chunk_id));
  const byBullet = new Map<string, ChunkExtraction[]>();

  for (const ext of unmerged) {
    const key = normalize(ext.bullet_point);
    const group = byBullet.get(key) ?? [];
    group.push(ext);
    byBullet.set(key, group);
  }

  const merges = new Map<string, string[]>();
  for (const [bullet, group] of byBullet) {
    if (group.length < 2) continue;
    const canonical = group[0]!.chunk_id;
    const all = group.map((e) => e.chunk_id);
    merges.set(canonical, all);
    log.debug({ bullet, count: group.length, rule: "dedup" }, "Rule 4: staging dedup merge");
  }

  return merges;
}

export function dedupMergeRecord(chunkIds: string[]): MergeRecord {
  return {
    rule: "staging-dedup",
    mergeConfidence: "medium",
    evidenceLinks: chunkIds.map((id, i) => ({
      chunkId: id,
      evidenceRole: i === 0 ? "general_spec" : "duplication",
    })),
    whyMerged: "Identical bullet_point detected in multiple extractions after earlier rules applied",
  };
}
