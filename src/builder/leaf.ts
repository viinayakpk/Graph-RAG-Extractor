import type { ConsolidatedRequirement } from "../types/requirement.js";
import type { ProcurementMatchDeliverable } from "../types/tree.js";

export function assembleLeaf(
  req: ConsolidatedRequirement,
  docLanguage: string,
): ProcurementMatchDeliverable {
  // Key the verbatim original by the document's language (resolved by the builder),
  // not a hardcoded "de". An English document gets no separate original key.
  const lang = docLanguage.toLowerCase().slice(0, 2);
  return {
    bulletPoint: req.bullet_point,
    description: {
      en: req.description_en,
      ...(req.description_de && lang !== "en" ? { [lang]: req.description_de } : {}),
    },
    priority: req.priority,
    confidence: req.confidence,
    equivalenceAllowed: req.equivalence_allowed,
    fullfillable: null,

    // Assessment-fixed fields
    status: "waitingForAnalysis",
    aiReasoning: null,
    feedback: null,
    feedbackText: null,
    openQuestionId: null,
    workspaceDocumentChunkIdArray: [],
    citedProductIdArray: [],
    citedPersonIdArray: [],

    // Core payload
    deliverableArray: [],
    procurementDocumentChunkIdArray: req.source_chunk_ids,
  };
}
