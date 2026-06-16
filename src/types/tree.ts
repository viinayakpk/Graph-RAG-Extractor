// The ProcurementMatchDeliverable output interface — the deliverable shape.
export type LocaleObject<T> = Record<string, T>;

export interface ProcurementMatchDeliverable {
  bulletPoint: string;
  description: LocaleObject<string>;
  priority: "must" | "should" | "optional";
  confidence: "high" | "medium" | "low" | null;
  equivalenceAllowed: boolean | null;
  fullfillable: "yes" | "no" | "maybe" | null;
  status:
    | "waitingForAnalysis"
    | "waitingForAnswer"
    | "waitingForAnswerPropagation"
    | "waitingForReview"
    | "userDefined";
  aiReasoning: LocaleObject<string> | null;
  feedback: "good" | "bad" | null;
  feedbackText: string | null;
  openQuestionId: string | null;
  deliverableArray: ProcurementMatchDeliverable[];
  procurementDocumentChunkIdArray: string[];
  workspaceDocumentChunkIdArray: string[];
  citedProductIdArray: string[];
  citedPersonIdArray: string[];
}
