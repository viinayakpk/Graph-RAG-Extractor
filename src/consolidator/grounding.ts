import type { Logger } from "pino";
import type { Chunk } from "../types/chunk.js";
import type { ConsolidatedRequirement } from "../types/requirement.js";

// ---------------------------------------------------------------------------
// Number grounding — the money-grade faithfulness check. A leaf's English
// description is the model's translation/paraphrase, so a digit could in principle
// drift ("2,50m" → "25.0m", a dropped zero). Here we verify that every numeric
// value in description_en actually appears in the leaf's own source chunks. Any
// value we cannot find is reported and the leaf's confidence is honestly dropped
// to "low" — which the brief defines as "flag for human review". We never raise
// confidence and never alter a value; this only ever flags.
//
// Matching is separator-tolerant but value-exact: a source "2,50" grounds an
// English "2.50" (comma/point locale swap), but a dropped digit "2.5" stays
// ungrounded. Comparison is on whole number tokens, never substrings, so "25"
// is not falsely grounded by a source "250".
// ---------------------------------------------------------------------------

const NUMBER_RE = /\d[\d., ]*\d|\d/g;

function numberTokens(text: string): string[] {
  return (text.match(NUMBER_RE) ?? [])
    .map((t) => t.replace(/ /g, "").replace(/[.,]+$/, "")) // drop NBSP + trailing separators
    .filter((t) => t.length > 0);
}

// Locale-tolerant forms of one number token, compared as whole values.
function forms(token: string): Set<string> {
  return new Set([
    token,
    token.replace(/\./g, ","),
    token.replace(/,/g, "."),
    token.replace(/[.,]/g, ""), // separators removed (digit form, still whole-token)
  ]);
}

function groundedNumbers(sourceText: string): Set<string> {
  const out = new Set<string>();
  for (const tok of numberTokens(sourceText)) {
    for (const f of forms(tok)) out.add(f);
  }
  return out;
}

function isGrounded(token: string, source: Set<string>): boolean {
  for (const f of forms(token)) {
    if (source.has(f)) return true;
  }
  return false;
}

export interface GroundingStats {
  leavesChecked: number;
  leavesFlagged: number;
  numbersChecked: number;
  numbersUngrounded: number;
}

export function verifyGrounding(
  requirements: ConsolidatedRequirement[],
  chunks: Chunk[],
  log: Logger,
): { requirements: ConsolidatedRequirement[]; stats: GroundingStats } {
  const chunkById = new Map(chunks.map((c) => [c.chunk_id, c]));
  const stats: GroundingStats = {
    leavesChecked: 0,
    leavesFlagged: 0,
    numbersChecked: 0,
    numbersUngrounded: 0,
  };

  const verified = requirements.map((req) => {
    // The leaf's full provenance: chunk body text AND structural identifiers (room
    // / position / section codes live in headings and position numbers, and the
    // model legitimately echoes them — "in room 2.OG.08"), plus its own German
    // verbatim. All of it is ground truth for the numbers the English echoes.
    const sourceParts: string[] = [
      req.description_de ?? "",
      req.section_heading ?? "",
      req.item_number ?? "",
      req.category_code ?? "",
    ];
    let missingChunk = false;
    for (const id of req.source_chunk_ids) {
      const chunk = chunkById.get(id);
      if (chunk === undefined) missingChunk = true;
      else sourceParts.push(chunk.content, chunk.section_heading ?? "", chunk.lv_position ?? "");
    }
    const grounded = groundedNumbers(sourceParts.join("\n"));

    const tokens = numberTokens(req.description_en);
    if (tokens.length === 0) return req;
    stats.leavesChecked++;

    const ungrounded = tokens.filter((t) => !isGrounded(t, grounded));
    stats.numbersChecked += tokens.length;
    stats.numbersUngrounded += ungrounded.length;
    if (ungrounded.length === 0) return req;

    stats.leavesFlagged++;
    // Cannot verify (a referenced chunk was absent) is logged differently from a
    // value that is present in source but altered — only the latter is a real
    // faithfulness concern, but both warrant a human glance, so both drop to low.
    log.warn(
      {
        id: req.id,
        bullet: req.bullet_point,
        source_file: chunks[0]?.source_file,
        unverified_numbers: [...new Set(ungrounded)],
        missing_chunk: missingChunk,
        was_confidence: req.confidence,
      },
      "grounding: numeric value(s) in description not found in source — confidence lowered",
    );
    return { ...req, confidence: "low" as const };
  });

  log.info(stats, "grounding verification complete");
  return { requirements: verified, stats };
}
