import type { Logger } from "pino";
import type { Chunk } from "../types/chunk.js";
import type { ChunkExtraction } from "../types/requirement.js";
import { buildClient, modelName } from "./client.js";
import { readCache, writeCache } from "./cache.js";
import { createQueue } from "./queue.js";
import {
  PROMPT_VERSION,
  SYSTEM_PROMPT_GENERAL,
  SYSTEM_PROMPT_LV_POSITION,
  SYSTEM_PROMPT_SECTION,
  SYSTEM_PROMPT_VORBEMERKUNGEN,
} from "./prompt.js";
import {
  validateExtractions,
  recoverPartialExtractions,
  makePlaceholder,
} from "./validate.js";

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

function systemPromptFor(chunk: Chunk): string {
  if (chunk.document_region === "lv-position") return SYSTEM_PROMPT_LV_POSITION;
  if (chunk.document_region === "section") return SYSTEM_PROMPT_SECTION;
  if (chunk.document_region === "vorbemerkungen") return SYSTEM_PROMPT_VORBEMERKUNGEN;
  return SYSTEM_PROMPT_GENERAL;
}

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

async function callWithRetry(
  chunk: Chunk,
  log: Logger
): Promise<ChunkExtraction[]> {
  const client = buildClient();
  const model = modelName();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      log.info(
        { chunk_id: chunk.chunk_id, source_file: chunk.source_file, model, PROMPT_VERSION, attempt },
        "calling DeepSeek"
      );

      const response = await client.chat.completions.create({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPromptFor(chunk) },
          { role: "user", content: buildUserMessage(chunk) },
        ],
      });

      if (response.usage) {
        log.info(
          {
            chunk_id: chunk.chunk_id,
            source_file: chunk.source_file,
            prompt_tokens: response.usage.prompt_tokens,
            completion_tokens: response.usage.completion_tokens,
            total_tokens: response.usage.total_tokens,
          },
          "DeepSeek token usage"
        );
      }

      const rawContent = response.choices[0]?.message?.content ?? "{}";
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawContent);
      } catch {
        log.warn({ chunk_id: chunk.chunk_id, source_file: chunk.source_file }, "LLM returned non-JSON");
        continue;
      }

      const asObj = parsed as Record<string, unknown>;
      const items = asObj["extractions"];

      // Tier 1: validate full array
      if (Array.isArray(items)) {
        const valid = validateExtractions(items, chunk.chunk_id, chunk.source_file, log);
        if (valid.length > 0) return valid;

        // Tier 2: recover partial
        const partial = recoverPartialExtractions(items, chunk.chunk_id, chunk.source_file, log);
        if (partial.length > 0) return partial;
      }

      log.warn(
        { chunk_id: chunk.chunk_id, source_file: chunk.source_file, attempt },
        "no valid extractions in response, retrying"
      );
    } catch (err) {
      const jitter = Math.random() * 500;
      const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1) + jitter;
      log.warn(
        { chunk_id: chunk.chunk_id, source_file: chunk.source_file, attempt, delay_ms: delay, err },
        "DeepSeek call failed, backing off"
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Tier 3: placeholder — never drop the chunk
  log.error(
    { chunk_id: chunk.chunk_id, source_file: chunk.source_file },
    "all retry attempts exhausted — inserting LOW_CONFIDENCE_PLACEHOLDER"
  );
  return [makePlaceholder(chunk.chunk_id, chunk.source_file)];
}

export async function extract(
  chunks: Chunk[],
  cacheDir: string,
  force: boolean,
  log: Logger
): Promise<ChunkExtraction[]> {
  const queue = createQueue();
  const all: ChunkExtraction[] = [];

  const tasks = chunks.map((chunk) =>
    queue(async () => {
      if (!force) {
        const cached = await readCache(cacheDir, chunk.chunk_id);
        if (cached) {
          log.info({ chunk_id: chunk.chunk_id, source_file: chunk.source_file }, "cache hit");
          return cached;
        }
      }

      const extractions = await callWithRetry(chunk, log);
      await writeCache(cacheDir, chunk.chunk_id, extractions);
      log.info(
        { chunk_id: chunk.chunk_id, source_file: chunk.source_file, count: extractions.length },
        "extracted requirements"
      );
      return extractions;
    })
  );

  const results = await Promise.all(tasks);
  for (const batch of results) all.push(...batch);

  log.info({ total: all.length }, "extraction complete");
  return all;
}
