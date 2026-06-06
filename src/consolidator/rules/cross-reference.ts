import type { Logger } from "pino";
import type { ChunkExtraction, MergeRecord } from "../../types/requirement.js";

// Rule 0: bidirectional OZ cross-reference
// If extraction A mentions OZ X in cross_referenced_positions, and extraction B has item_number X,
// they describe the same deliverable — merge them.
export function applyCrossReferenceRule(
  extractions: ChunkExtraction[],
  log: Logger
): Map<string, string[]> {
  // Returns a map: canonical chunk_id → all chunk_ids to merge into it
  const groups = new Map<string, Set<string>>();
  const ozIndex = new Map<string, string>(); // OZ string → chunk_id that owns it

  for (const ext of extractions) {
    if (ext.item_number) ozIndex.set(ext.item_number, ext.chunk_id);
  }

  for (const ext of extractions) {
    for (const ref of ext.cross_referenced_positions) {
      const targetChunkId = ozIndex.get(ref);
      if (!targetChunkId || targetChunkId === ext.chunk_id) continue;

      // Use lexicographically smaller chunk_id as canonical
      const canonical = ext.chunk_id < targetChunkId ? ext.chunk_id : targetChunkId;
      const secondary = canonical === ext.chunk_id ? targetChunkId : ext.chunk_id;

      if (!groups.has(canonical)) groups.set(canonical, new Set([canonical]));
      groups.get(canonical)!.add(secondary);

      log.debug(
        { canonical, secondary, oz_reference: ref, rule: "cross-reference" },
        "Rule 0: cross-reference merge candidate"
      );
    }
  }

  return new Map(
    [...groups.entries()].map(([k, v]) => [k, [...v]])
  );
}

export function crossReferenceMergeRecord(
  canonicalChunkId: string,
  mergedChunkIds: string[],
  referencedOz: string
): MergeRecord {
  return {
    rule: "cross-reference",
    mergeConfidence: "high",
    evidenceLinks: mergedChunkIds.map((id) => ({
      chunkId: id,
      evidenceRole: id === canonicalChunkId ? "general_spec" : "cross_reference",
    })),
    whyMerged: `OZ position ${referencedOz} explicitly referenced in source text`,
  };
}
