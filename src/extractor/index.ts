import type { Logger } from "pino";
import type { Chunk } from "../types/chunk.js";
import type { ChunkExtraction } from "../types/requirement.js";
import { buildClient, modelName } from "./client.js";
import { readCache, writeCache } from "./cache.js";
import { createQueue } from "./queue.js";
import { PROMPT_VERSION, buildSystemPrompt } from "./prompt.js";
import { validateExtractions, recoverPartialExtractions } from "./validate.js";

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;
const RETRY_JITTER_MS = 500;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function buildUserMessage(chunk: Chunk): string {
  return [
    `Source file: ${chunk.source_file}`,
    `Page: ${chunk.page_number}`,
    chunk.section_heading ? `Section: ${chunk.section_heading}` : null,
    chunk.lv_position ? `LV Position: ${chunk.lv_position}` : null,
    "",
    chunk.content,
  ]
    .filter(Boolean)
    .join("\n");
}

interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

function logTokenUsage(chunk: Chunk, usage: TokenUsage | undefined, log: Logger): void {
  if (!usage) return;
  log.info(
    {
      chunk_id: chunk.chunk_id,
      source_file: chunk.source_file,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
    },
    "DeepSeek token usage",
  );
}

// Extract requirements from one chunk. Return values are deliberately distinct:
//   ChunkExtraction[] — zero or more requirements. An *empty* array is a valid
//                       answer: the chunk carries no obligation (boilerplate,
//                       a heading-only block, a cancelled position).
//   null              — extraction failed after every retry. The caller excludes
//                       the chunk from the tree instead of inventing a node, so
//                       every leaf still traces back to real extracted text.
async function callWithRetry(
  chunk: Chunk,
  log: Logger,
): Promise<ChunkExtraction[] | null> {
  const client = buildClient();
  const model = modelName();
  const systemPrompt = buildSystemPrompt(chunk.document_region);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      log.info(
        { chunk_id: chunk.chunk_id, source_file: chunk.source_file, model, PROMPT_VERSION, attempt },
        "calling DeepSeek",
      );

      const response = await client.chat.completions.create({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: buildUserMessage(chunk) },
        ],
      });

      logTokenUsage(chunk, response.usage, log);

      const rawContent = response.choices[0]?.message?.content ?? "{}";
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawContent);
      } catch {
        log.warn(
          { chunk_id: chunk.chunk_id, source_file: chunk.source_file, attempt },
          "model returned non-JSON, retrying",
        );
        continue;
      }

      const items = (parsed as Record<string, unknown>)["extractions"];
      if (!Array.isArray(items)) {
        log.warn(
          { chunk_id: chunk.chunk_id, source_file: chunk.source_file, attempt },
          "response has no 'extractions' array, retrying",
        );
        continue;
      }

      // An explicitly empty array is a valid result — accept it instead of
      // burning the remaining retries and fabricating a placeholder node.
      if (items.length === 0) {
        log.info(
          { chunk_id: chunk.chunk_id, source_file: chunk.source_file },
          "model reported no requirements for this chunk",
        );
        return [];
      }

      // Tier 1: validate and enrich the whole array.
      const valid = validateExtractions(items, chunk, log);
      if (valid.length > 0) return valid;

      // Tier 2: salvage any individually well-formed items.
      const partial = recoverPartialExtractions(items, chunk, log);
      if (partial.length > 0) return partial;

      log.warn(
        { chunk_id: chunk.chunk_id, source_file: chunk.source_file, attempt },
        "no items survived validation, retrying",
      );
    } catch (err) {
      const delay = RETRY_BASE_MS * 2 ** (attempt - 1) + Math.random() * RETRY_JITTER_MS;
      log.warn(
        { chunk_id: chunk.chunk_id, source_file: chunk.source_file, attempt, delay_ms: Math.round(delay), err },
        "DeepSeek call failed, backing off",
      );
      await sleep(delay);
    }
  }

  log.error(
    { chunk_id: chunk.chunk_id, source_file: chunk.source_file, attempts: MAX_RETRIES },
    "extraction failed after all retries — chunk excluded from tree",
  );
  return null;
}

export async function extract(
  chunks: Chunk[],
  cacheDir: string,
  force: boolean,
  log: Logger,
): Promise<ChunkExtraction[]> {
  const queue = createQueue();

  const tasks = chunks.map((chunk) =>
    queue(async (): Promise<ChunkExtraction[] | null> => {
      if (!force) {
        const cached = await readCache(cacheDir, chunk.chunk_id);
        if (cached) {
          log.info(
            { chunk_id: chunk.chunk_id, source_file: chunk.source_file, count: cached.length },
            "cache hit",
          );
          return cached;
        }
      }

      const extractions = await callWithRetry(chunk, log);
      if (extractions === null) {
        // Failure already logged at error level. Do NOT cache it, so a re-run
        // retries the chunk instead of treating the failure as a final answer.
        return null;
      }

      await writeCache(cacheDir, chunk.chunk_id, extractions);
      log.info(
        { chunk_id: chunk.chunk_id, source_file: chunk.source_file, count: extractions.length },
        "extracted requirements",
      );
      return extractions;
    }),
  );

  const results = await Promise.all(tasks);

  const all: ChunkExtraction[] = [];
  let failedChunks = 0;
  for (const batch of results) {
    if (batch === null) {
      failedChunks++;
      continue;
    }
    all.push(...batch);
  }

  if (failedChunks > 0) {
    log.error(
      { failedChunks, totalChunks: chunks.length },
      "chunks failed extraction after all retries and are absent from the tree",
    );
  }
  log.info(
    { total: all.length, failedChunks, totalChunks: chunks.length },
    "extraction complete",
  );
  return all;
}
