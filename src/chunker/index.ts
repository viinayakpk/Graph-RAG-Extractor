import type { Logger } from "pino";
import type { DocumentProfile, ParsedDocument } from "../types/document.js";
import type { Chunk } from "../types/chunk.js";
import { structureChunk } from "./structure.js";

// One structure-aware chunker for every document. The profiler's strategy is now
// only a hint (it decides whether LV pricing-noise stripping runs); the chunking
// itself reads the page geometry, so it no longer depends on a per-tender path.
export async function chunk(
  doc: ParsedDocument,
  profile: DocumentProfile,
  log: Logger,
): Promise<Chunk[]> {
  log.info({ filename: doc.filename, strategy: profile.suggestedStrategy }, "chunking (structure-aware)");
  return structureChunk(doc, profile, log);
}
