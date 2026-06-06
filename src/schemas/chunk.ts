import { z } from "zod";
import type { Chunk } from "../types/chunk.js";

export const ChunkSchema: z.ZodType<Chunk> = z.object({
  chunk_id: z.string().min(1),
  source_file: z.string().min(1),
  page_number: z.union([z.number().int().positive(), z.string().min(1)]),
  section_heading: z.string().nullable(),
  lv_position: z.string().nullable(),
  document_region: z.enum(["section", "lv-position", "vorbemerkungen"]),
  category_code: z.string().nullable(),
  content: z.string().min(1),
});

export type ChunkInput = z.input<typeof ChunkSchema>;
