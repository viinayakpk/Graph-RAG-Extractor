import type { Logger } from "pino";
import type { ChunkExtraction } from "../types/requirement.js";

// Optional Rule 5: embedding-based similarity fallback
// Only runs if EMBEDDING_SIMILARITY_ENABLED=true is set
// Uses simple cosine similarity on TF-IDF vectors as a zero-dependency baseline
// TODO: replace with actual embedding model call if needed
export async function applySimilarityRule(
  extractions: ChunkExtraction[],
  log: Logger
): Promise<Map<string, string[]>> {
  const enabled = process.env["EMBEDDING_SIMILARITY_ENABLED"] === "true";
  if (!enabled) {
    log.debug("embedding similarity rule disabled — set EMBEDDING_SIMILARITY_ENABLED=true to enable");
    return new Map();
  }

  log.info({ count: extractions.length }, "embedding similarity rule: not yet implemented");
  // TODO: implement TF-IDF or call embeddings API
  // Threshold: cosine_similarity > 0.92 AND same priority → merge candidate
  return new Map();
}
