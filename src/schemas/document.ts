import { z } from "zod";
import type { DocumentProfile } from "../types/document.js";

export const DocumentProfileSchema: z.ZodType<DocumentProfile> = z.object({
  filename: z.string().min(1),
  pageCount: z.number().int().positive(),
  avgCharsPerPage: z.number().nonnegative(),
  ligatureCorruptionRate: z.number().min(0).max(1),
  columnNoiseDetected: z.boolean(),
  lvPositionCount: z.number().int().nonnegative(),
  vorbemerkungenPagesEstimate: z.number().int().nonnegative(),
  repeatedHeaderLines: z.array(z.string()),
  suggestedStrategy: z.enum([
    "section-list",
    "lv-position",
    "vorbemerkungen-heavy",
    "mixed",
  ]),
  parserConfidence: z.enum(["high", "medium", "low"]),
});
