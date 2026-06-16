import type { Logger } from "pino";
import type { DocumentProfile, ParsedDocument } from "../types/document.js";
import type { Chunk } from "../types/chunk.js";
import { structureChunk } from "./structure.js";

// One structure-aware chunker for every document; the profiler's strategy is only
// a hint (whether LV-noise stripping runs).
export async function chunk(
  doc: ParsedDocument,
  profile: DocumentProfile,
  log: Logger,
): Promise<Chunk[]> {
  log.info({ filename: doc.filename, strategy: profile.suggestedStrategy }, "chunking (structure-aware)");
  return structureChunk(doc, profile, log);
}
