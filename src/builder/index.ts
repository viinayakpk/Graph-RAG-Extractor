import type { Logger } from "pino";
import type { ConsolidatedRequirement } from "../types/requirement.js";
import type { ProcurementMatchDeliverable } from "../types/tree.js";
import { discoverGroups } from "./group.js";
import { assembleLeaf } from "./leaf.js";

// Grouping nodes (L1, L2, root) carry no document-sourced description — leave it empty.
// Only L3 leaves have descriptions derived from actual tender text.
function makeGroupNode(
  bulletPoint: string,
  children: ProcurementMatchDeliverable[],
  allChunkIds: string[]
): ProcurementMatchDeliverable {
  return {
    bulletPoint,
    description: {},
    priority: "must",
    confidence: null,
    equivalenceAllowed: null,
    fullfillable: null,
    status: "waitingForAnalysis",
    aiReasoning: null,
    feedback: null,
    feedbackText: null,
    openQuestionId: null,
    workspaceDocumentChunkIdArray: [],
    citedProductIdArray: [],
    citedPersonIdArray: [],
    deliverableArray: children,
    procurementDocumentChunkIdArray: allChunkIds,
  };
}

export function buildTree(
  requirements: ConsolidatedRequirement[],
  tenderName: string,
  log: Logger
): ProcurementMatchDeliverable {
  log.info({ requirements: requirements.length, tender: tenderName }, "building deliverable tree");

  const groups = discoverGroups(requirements);

  const l1Map = new Map<string, { label: string; l2Nodes: ProcurementMatchDeliverable[]; chunkIds: string[] }>();

  for (const group of groups) {
    const leaves = group.requirements.map(assembleLeaf);
    const groupChunkIds = group.requirements.flatMap((r) => r.source_chunk_ids);

    const l2Node = makeGroupNode(group.l2Label, leaves, groupChunkIds);

    const existing = l1Map.get(group.l1Key) ?? { label: group.l1Label, l2Nodes: [], chunkIds: [] };
    existing.l2Nodes.push(l2Node);
    existing.chunkIds.push(...groupChunkIds);
    l1Map.set(group.l1Key, existing);
  }

  const l1Nodes: ProcurementMatchDeliverable[] = [];
  for (const [, l1] of l1Map) {
    l1Nodes.push(makeGroupNode(l1.label, l1.l2Nodes, l1.chunkIds));
  }

  const allChunkIds = requirements.flatMap((r) => r.source_chunk_ids);
  const root = makeGroupNode(tenderName, l1Nodes, allChunkIds);

  log.info({ l1Count: l1Nodes.length, totalLeaves: requirements.length }, "tree built");
  return root;
}
