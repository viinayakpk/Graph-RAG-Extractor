import type { MergeRecord } from "../../types/requirement.js";

// Same OZ position appearing in multiple chunks (one position split across pages).
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
