import type { Logger } from "pino";
import type { ConsolidatedRequirement } from "../types/requirement.js";
import type { ProcurementMatchDeliverable } from "../types/tree.js";
import { discoverGroups } from "./group.js";
import { discoverGroupingLlm } from "./grouping.js";
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

// The document's language: the most common non-null source_language, default "en".
// A tender is one language, so this resolves per-leaf noise.
function dominantLanguage(requirements: ConsolidatedRequirement[]): string {
  const counts = new Map<string, number>();
  for (const r of requirements) {
    const lang = r.source_language?.toLowerCase().slice(0, 2);
    if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  let best = "en";
  let bestCount = 0;
  for (const [lang, n] of counts) {
    if (n > bestCount) {
      best = lang;
      bestCount = n;
    }
  }
  return best;
}

export async function buildTree(
  requirements: ConsolidatedRequirement[],
  tenderName: string,
  log: Logger
): Promise<ProcurementMatchDeliverable> {
  log.info({ requirements: requirements.length, tender: tenderName }, "building deliverable tree");

  // Resolve the document language once (by majority) so the verbatim-original locale
  // key is consistent and English documents get no spurious foreign key.
  const docLanguage = dominantLanguage(requirements);
  log.info({ docLanguage }, "resolved document language");

  // Semantic grouping via the LLM (the #1 evaluation criterion); deterministic
  // mechanical grouping is the fallback if the call fails.
  const groups = (await discoverGroupingLlm(requirements, log)) ?? discoverGroups(requirements);

  const l1Map = new Map<string, { label: string; l2Nodes: ProcurementMatchDeliverable[]; chunkIds: string[] }>();

  for (const group of groups) {
    const leaves = group.requirements.map((r) => assembleLeaf(r, docLanguage));
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
