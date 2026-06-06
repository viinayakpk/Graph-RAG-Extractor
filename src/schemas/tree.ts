import { z } from "zod";
import type { ProcurementMatchDeliverable } from "../types/tree.js";

export const ProcurementMatchDeliverableSchema: z.ZodType<ProcurementMatchDeliverable> =
  z.lazy(() =>
    z.object({
      bulletPoint: z.string().min(1),
      description: z.record(z.string()),
      priority: z.enum(["must", "should", "optional"]),
      confidence: z.enum(["high", "medium", "low"]).nullable(),
      equivalenceAllowed: z.boolean().nullable(),
      fullfillable: z.enum(["yes", "no", "maybe"]).nullable(),
      status: z.enum([
        "waitingForAnalysis",
        "waitingForAnswer",
        "waitingForAnswerPropagation",
        "waitingForReview",
        "userDefined",
      ]),
      aiReasoning: z.record(z.string()).nullable(),
      feedback: z.enum(["good", "bad"]).nullable(),
      feedbackText: z.string().nullable(),
      openQuestionId: z.string().nullable(),
      deliverableArray: z.array(ProcurementMatchDeliverableSchema),
      procurementDocumentChunkIdArray: z.array(z.string()),
      workspaceDocumentChunkIdArray: z.array(z.string()),
      citedProductIdArray: z.array(z.string()),
      citedPersonIdArray: z.array(z.string()),
    }),
  );

export type ProcurementMatchDeliverableInput = z.input<
  typeof ProcurementMatchDeliverableSchema
>;
