import type { MergeRecord } from "../../types/requirement.js";

// A Salzburg vorbemerkungen spec (the requirement) plus every room position of
// its category (where the spec is applied). The spec chunk is the general spec;
// the position chunks are room-placement evidence.
export function preambleCategoryMergeRecord(
  categoryCode: string,
  preambleChunkIds: string[],
  positionChunkIds: string[],
): MergeRecord {
  return {
    rule: "vorbemerkungen-category",
    mergeConfidence: "high",
    evidenceLinks: [
      ...preambleChunkIds.map((id) => ({ chunkId: id, evidenceRole: "general_spec" as const })),
      ...positionChunkIds.map((id) => ({ chunkId: id, evidenceRole: "room_placement" as const })),
    ],
    whyMerged: `Category ${categoryCode}: vorbemerkungen spec applied across ${positionChunkIds.length} room placement(s)`,
  };
}
