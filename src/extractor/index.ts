import type { Logger } from "pino";
import type { Chunk } from "../types/chunk.js";
import type { ChunkExtraction } from "../types/requirement.js";
import { buildClient, modelName } from "./client.js";
import { readCache, writeCache } from "./cache.js";
import { createQueue } from "./queue.js";
import { PROMPT_VERSION, buildSystemPrompt, buildGleanerPrompt } from "./prompt.js";
import { validateExtractions, recoverPartialExtractions } from "./validate.js";
import { extractionConfig } from "../config.js";

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

// Split a chunk's content in half by lines, keeping all metadata (same chunk_id,
// page, position, category). Used only when a block is so dense that the model's
// extraction JSON overflows its output-token cap — splitting lets each half fit.
// Returns null when the content is a single line and cannot be divided.
function splitChunkContent(chunk: Chunk): [Chunk, Chunk] | null {
  const halve = (parts: string[], joiner: string): [Chunk, Chunk] => {
    const mid = Math.ceil(parts.length / 2);
    return [
      { ...chunk, content: parts.slice(0, mid).join(joiner) },
      { ...chunk, content: parts.slice(mid).join(joiner) },
    ];
  };
  const lines = chunk.content.split("\n");
  if (lines.length >= 2) return halve(lines, "\n");
  // A single over-dense line: split on words, then on characters as a last resort,
  // so a one-line block can still be extracted in halves instead of being dropped.
  const words = chunk.content.split(" ");
  if (words.length >= 2) return halve(words, " ");
  if (chunk.content.length >= 2) return halve([...chunk.content], "");
  return null; // a single character — cannot split (and cannot overflow either)
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

      // Output hit the token cap (8192 for deepseek-chat): the JSON is truncated
      // mid-string and unparseable, and retrying at temperature 0 reproduces it
      // exactly. Split the block and extract the halves instead — this is the only
      // way to recover an over-dense chunk without losing it from the tree.
      if (response.choices[0]?.finish_reason === "length") {
        const halves = splitChunkContent(chunk);
        if (!halves) {
          log.error(
            { chunk_id: chunk.chunk_id, source_file: chunk.source_file },
            "extraction output truncated and chunk is a single line — cannot split, excluded",
          );
          return null;
        }
        log.warn(
          { chunk_id: chunk.chunk_id, source_file: chunk.source_file, attempt },
          "extraction output truncated — splitting chunk and extracting halves",
        );
        const [first, second] = await Promise.all([
          callWithRetry(halves[0], log),
          callWithRetry(halves[1], log),
        ]);
        if (first === null && second === null) return null;
        return [...(first ?? []), ...(second ?? [])];
      }

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

// Recall second pass: re-read the block knowing what the first pass produced, and
// keep only obligations it missed. Best-effort — a single call, no retry; on any
// failure we keep the first-pass result. Items are validated and (downstream)
// number-grounded like any other, so the gleaner cannot silently invent.
async function gleanAdditional(
  chunk: Chunk,
  existing: ChunkExtraction[],
  log: Logger,
): Promise<ChunkExtraction[]> {
  if (existing.length === 0) return [];
  const already = existing.map((e, i) => `${i + 1}. ${e.bullet_point}`).join("\n");
  const userMessage = `${buildUserMessage(chunk)}\n\n## Already extracted (do not repeat)\n${already}`;
  try {
    const response = await buildClient().chat.completions.create({
      model: modelName(),
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildGleanerPrompt(chunk.document_region) },
        { role: "user", content: userMessage },
      ],
    });
    logTokenUsage(chunk, response.usage, log);
    if (response.choices[0]?.finish_reason === "length") return []; // ignore a truncated gleaner
    const items = (JSON.parse(response.choices[0]?.message?.content ?? "{}") as Record<string, unknown>)["extractions"];
    if (!Array.isArray(items) || items.length === 0) return [];
    const valid = validateExtractions(items, chunk, log);
    const gleaned = valid.length > 0 ? valid : recoverPartialExtractions(items, chunk, log);
    // Defensive dedup: drop any gleaned item that restates a first-pass bullet.
    const seen = new Set(existing.map((e) => e.bullet_point.toLowerCase().trim()));
    const fresh = gleaned.filter((g) => !seen.has(g.bullet_point.toLowerCase().trim()));
    if (fresh.length > 0) {
      log.info(
        { chunk_id: chunk.chunk_id, source_file: chunk.source_file, gleaned: fresh.length },
        "recall gleaner found additional requirements the first pass missed",
      );
    }
    return fresh;
  } catch (err) {
    log.warn(
      { chunk_id: chunk.chunk_id, source_file: chunk.source_file, err },
      "recall gleaner failed — keeping first-pass extractions only",
    );
    return [];
  }
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

      // Glean only prose / preamble blocks, where the first pass can miss one
      // obligation among many. A single LV position is one deliverable the first
      // pass already extracts in full, so gleaning it only restates sub-clauses.
      const extra =
        extractionConfig.recallGleaner && chunk.document_region !== "lv-position"
          ? await gleanAdditional(chunk, extractions, log)
          : [];
      const combined = extra.length > 0 ? [...extractions, ...extra] : extractions;

      await writeCache(cacheDir, chunk.chunk_id, combined);
      log.info(
        { chunk_id: chunk.chunk_id, source_file: chunk.source_file, count: combined.length, gleaned: extra.length },
        "extracted requirements",
      );
      return combined;
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
