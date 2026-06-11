import type { Logger } from "pino";
import type { Chunk } from "./types/chunk.js";
import type { ChunkExtraction, ConsolidatedRequirement } from "./types/requirement.js";
import type { ProcurementMatchDeliverable } from "./types/tree.js";
import { profile } from "./profiler/index.js";
import { parse } from "./parser/index.js";
import { chunk } from "./chunker/index.js";
import { extract } from "./extractor/index.js";
import { consolidate } from "./consolidator/index.js";
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

  const tree = buildTree(consolidated, documentProfile.filename, log);
  // Fail loudly if the assembled tree does not match the deliverable contract.
  ProcurementMatchDeliverableSchema.parse(tree);
  const leafCount = countLeaves([tree]);
  log.info({ leafCount }, "builder done, tree validated");

  return { chunks, extractions, consolidated, tree, stats: { leafCount } };
}

function countLeaves(nodes: ProcurementMatchDeliverable[]): number {
  return nodes.reduce((sum, node) => {
    return node.deliverableArray.length === 0
      ? sum + 1
      : sum + countLeaves(node.deliverableArray);
  }, 0);
}
