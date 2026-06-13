import type { Logger } from "pino";
import type { Chunk } from "./types/chunk.js";
import type { ChunkExtraction, ConsolidatedRequirement } from "./types/requirement.js";
import type { ProcurementMatchDeliverable } from "./types/tree.js";
import { profile } from "./profiler/index.js";
import { parse } from "./parser/index.js";
import { chunk } from "./chunker/index.js";
import { extract } from "./extractor/index.js";
import { consolidate } from "./consolidator/index.js";
import { linkSemantic } from "./consolidator/semantic-link.js";
import { verifyGrounding } from "./consolidator/grounding.js";
import { buildTree } from "./builder/index.js";
import { ProcurementMatchDeliverableSchema } from "./schemas/tree.js";

export interface PipelineOptions {
  force: boolean;
}

export interface PipelineResult {
  chunks: Chunk[];
  extractions: ChunkExtraction[];
  consolidated: ConsolidatedRequirement[];
  tree: ProcurementMatchDeliverable;
  stats: { leafCount: number };
}

export async function runPipeline(
  pdfPath: string,
  outDir: string,
  options: PipelineOptions,
  log: Logger,
): Promise<PipelineResult> {
  const documentProfile = await profile(pdfPath, log);
  log.info({ strategy: documentProfile.suggestedStrategy, confidence: documentProfile.parserConfidence }, "profiler done");

  const parsed = await parse(pdfPath, documentProfile, log);
  log.info({ pageCount: parsed.pageCount }, "parser done");

  const chunks = await chunk(parsed, documentProfile, log);
  log.info({ chunkCount: chunks.length }, "chunker done");

  const extractions = await extract(chunks, outDir, options.force, log);
  log.info({ extractionCount: extractions.length }, "extractor done");

  const consolidated = consolidate(extractions, log);
  log.info({ requirementCount: consolidated.length }, "consolidator done");

  // Semantic linking: pull a deliverable's scattered pieces onto one leaf when no
  // position code or exact text connects them (the brief's headline case). Gated
  // so it can never fuse two distinct priced positions.
  const linked = await linkSemantic(consolidated, log);
  log.info({ before: consolidated.length, after: linked.length }, "semantic linking done");

  // Faithfulness gate: verify every numeric value in a leaf's English description
  // is present in its source chunks; honestly drop confidence to "low" otherwise.
  const { requirements: verified } = verifyGrounding(linked, chunks, log);

  const tree = await buildTree(verified, documentProfile.filename, log);
  // Fail loudly if the assembled tree does not match the deliverable contract.
  ProcurementMatchDeliverableSchema.parse(tree);
  const leafCount = countLeaves([tree]);
  log.info({ leafCount }, "builder done, tree validated");

  return { chunks, extractions, consolidated: verified, tree, stats: { leafCount } };
}

function countLeaves(nodes: ProcurementMatchDeliverable[]): number {
  return nodes.reduce((sum, node) => {
    return node.deliverableArray.length === 0
      ? sum + 1
      : sum + countLeaves(node.deliverableArray);
  }, 0);
}
