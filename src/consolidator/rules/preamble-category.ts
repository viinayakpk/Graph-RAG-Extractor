import type { Logger } from "pino";
import type { ChunkExtraction, MergeRecord } from "../../types/requirement.js";

// Rule 2 (Salzburg-critical): vorbemerkungen category_code matches room-position category_code
// The preamble (pp.2-61) defines general specs; the room positions (pp.62-409) reference them
// by category code. These must be merged so the leaf has both the spec and the room placements.
export function applyPreambleCategoryRule(
  extractions: ChunkExtraction[],
  log: Logger
): Map<string, string[]> {
  const preamble = extractions.filter((e) => e.category_code && !e.item_number);
  const positions = extractions.filter((e) => e.category_code && e.item_number);

  const byCategory = new Map<string, { preamble: ChunkExtraction[]; positions: ChunkExtraction[] }>();

  for (const ext of preamble) {
    const code = ext.category_code!;
    const entry = byCategory.get(code) ?? { preamble: [], positions: [] };
    entry.preamble.push(ext);
    byCategory.set(code, entry);
  }

  for (const ext of positions) {
    const code = ext.category_code!;
    const entry = byCategory.get(code) ?? { preamble: [], positions: [] };
    entry.positions.push(ext);
    byCategory.set(code, entry);
  }

  const merges = new Map<string, string[]>();
  for (const [code, { preamble: pre, positions: pos }] of byCategory) {
    if (pre.length === 0 || pos.length === 0) continue;
    const canonical = pre[0]!.chunk_id;
    const all = [canonical, ...pre.slice(1).map((e) => e.chunk_id), ...pos.map((e) => e.chunk_id)];
    merges.set(canonical, all);
    log.debug(
      { category_code: code, canonical, preamble_count: pre.length, position_count: pos.length, rule: "preamble-category" },
      "Rule 2: vorbemerkungen-category merge"
    );
  }

  return merges;
}

export function preambleCategoryMergeRecord(
  chunkIds: string[],
  categoryCode: string,
  preambleChunkIds: string[],
  positionChunkIds: string[]
): MergeRecord {
  return {
    rule: "vorbemerkungen-category",
    mergeConfidence: "high",
    evidenceLinks: [
      ...preambleChunkIds.map((id) => ({ chunkId: id, evidenceRole: "general_spec" as const })),
      ...positionChunkIds.map((id) => ({ chunkId: id, evidenceRole: "room_placement" as const })),
    ],
    whyMerged: `Category code ${categoryCode}: preamble spec merged with room-level positions`,
  };
}
