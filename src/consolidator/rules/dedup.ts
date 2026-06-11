import type { MergeRecord } from "../../types/requirement.js";

// Same requirement stated verbatim in more than one place (e.g. staged delivery
// repeated across pages), grouped by identical bullet_point within one section.
export function dedupMergeRecord(chunkIds: string[]): MergeRecord {
  return {
    rule: "staging-dedup",
    mergeConfidence: "medium",
    evidenceLinks: chunkIds.map((id, i) => ({
      chunkId: id,
      evidenceRole: i === 0 ? "general_spec" : "duplication",
    })),
    whyMerged: "Identical requirement text found in multiple chunks within the same section",
  };
}
