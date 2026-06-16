import type { Logger } from "pino";
import type { Chunk } from "../types/chunk.js";
import type { ConsolidatedRequirement } from "../types/requirement.js";

// Number grounding — the money-grade faithfulness check. Verifies every numeric value
// in a leaf's English description appears in its source chunks; an unverifiable value
// drops confidence to "low" (never alters a value). Separator-tolerant, whole-token.

const NUMBER_RE = /\d[\d., ]*\d|\d/g;

function numberTokens(text: string): string[] {
  return (text.match(NUMBER_RE) ?? [])
    .map((t) => t.replace(/ /g, "").replace(/[.,]+$/, ""))
    .filter((t) => t.length > 0);
}

// Measurement values only (<=1 separator); a multi-segment identifier code is
// verified structurally, not here.
function valueTokens(text: string): string[] {
  return numberTokens(text).filter((t) => (t.match(/[.,]/g) ?? []).length <= 1);
}

// Locale-tolerant forms of one number token, compared as whole values.
function forms(token: string): Set<string> {
  return new Set([
    token,
    token.replace(/\./g, ","),
    token.replace(/,/g, "."),
    token.replace(/[.,]/g, ""),
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
    // Ground truth: the leaf's chunk text + its structural codes (room/position/
    // section) + its German verbatim — every place the English numbers can come from.
    const sourceParts: string[] = [
      req.description_de ?? "",
      req.section_heading ?? "",
      req.item_number ?? "",
      req.category_code ?? "",
      req.standards.join(" "), // standard codes are identifiers, trusted as grounded
    ];
    let missingChunk = false;
    for (const id of req.source_chunk_ids) {
      const chunk = chunkById.get(id);
      if (chunk === undefined) missingChunk = true;
      else sourceParts.push(chunk.content, chunk.section_heading ?? "", chunk.lv_position ?? "");
    }
    const grounded = groundedNumbers(sourceParts.join("\n"));

    const tokens = valueTokens(req.description_en);
    if (tokens.length === 0) return req;
    stats.leavesChecked++;

    const ungrounded = tokens.filter((t) => !isGrounded(t, grounded));
    stats.numbersChecked += tokens.length;
    stats.numbersUngrounded += ungrounded.length;
    if (ungrounded.length === 0) return req;

    stats.leavesFlagged++;
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
