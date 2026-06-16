import type { Logger } from "pino";
import { z } from "zod";
import type { ConsolidatedRequirement } from "../types/requirement.js";
import { buildClient, modelName } from "../extractor/client.js";
import { OZ_LINE_RE } from "../parser/oz-patterns.js";
import { linkingConfig } from "../config.js";

// Semantic linking: a deliverable named in one place, specified in another, with no
// shared code or text. An LLM discriminator links them. Safety: it only pulls a scope
// statement onto a priced position, never fuses two positions — candidates are XOR on
// OZ codes, unions hold at most one OZ code, biased to "distinct".

const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 } as const;
const PRIORITY_RANK = { must: 3, should: 2, optional: 1 } as const;

const isOz = (n: string | null): boolean => !!n && OZ_LINE_RE.test(n);
const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();

function tokenSet(req: ConsolidatedRequirement): Set<string> {
  const text = `${req.bullet_point} ${req.description_en}`.toLowerCase();
  return new Set(
    text
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

// Overlap coefficient (intersection / smaller size) — not punished when one side is a
// short scope line and the other a long spec.
function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const t of small) if (large.has(t)) inter++;
  return inter / small.size;
}

const DiscriminatorSchema = z.object({
  relation: z.enum(["same", "distinct"]),
  reason: z.string().default(""),
});

const DISCRIMINATOR_SYSTEM = `You compare two requirements taken from the SAME procurement tender and decide whether they are the SAME single deliverable described in two different places, or TWO DISTINCT deliverables.
Answer "same" ONLY when they are one and the same obligation or item — for example a deliverable named in a preamble/scope and then specified as a priced position, or one requirement restated elsewhere.
Answer "distinct" if they differ in ANY specified value: model or type number, size or dimension, quantity, room or location, material, finish, or any technical figure. Two similar but separately-listed products are DISTINCT. A general scope sentence that merely mentions a feature of a larger item is DISTINCT from that item. When in any doubt, answer "distinct".
Return JSON: {"relation":"same"|"distinct","reason":"<one short sentence>"}`;

function pairMessage(a: ConsolidatedRequirement, b: ConsolidatedRequirement): string {
  const clip = (s: string): string => (s.length > 700 ? `${s.slice(0, 700)}…` : s);
  return [
    "Requirement A:",
    `Title: ${a.bullet_point}`,
    clip(a.description_en),
    "",
    "Requirement B:",
    `Title: ${b.bullet_point}`,
    clip(b.description_en),
  ].join("\n");
}

async function discriminate(
  a: ConsolidatedRequirement,
  b: ConsolidatedRequirement,
): Promise<z.infer<typeof DiscriminatorSchema>> {
  const client = buildClient();
  const response = await client.chat.completions.create({
    model: modelName(),
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: DISCRIMINATOR_SYSTEM },
      { role: "user", content: pairMessage(a, b) },
    ],
  });
  return DiscriminatorSchema.parse(JSON.parse(response.choices[0]?.message?.content ?? "{}"));
}

interface Candidate {
  a: ConsolidatedRequirement;
  b: ConsolidatedRequirement;
  score: number;
}

// Candidate pairs within one set of requirements: exactly one side is an OZ
// position (XOR), and their descriptions overlap enough to be worth a check.
function candidatesWithin(members: ConsolidatedRequirement[]): Candidate[] {
  const tokens = new Map(members.map((m) => [m.id, tokenSet(m)] as const));
  const out: Candidate[] = [];
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = members[i]!;
      const b = members[j]!;
      if (isOz(a.item_number) === isOz(b.item_number)) continue; // XOR: not both, not neither
      const score = overlap(tokens.get(a.id)!, tokens.get(b.id)!);
      if (score >= linkingConfig.overlapThreshold) out.push({ a, b, score });
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

// Below the size threshold every requirement is one block (full pairwise across
// the whole tender, catching cross-section links); above it we block by category
// then section to stay bounded.
function blocksFor(requirements: ConsolidatedRequirement[]): ConsolidatedRequirement[][] {
  if (requirements.length <= linkingConfig.fullPairwiseMaxReqs) return [requirements];
  const byKey = new Map<string, ConsolidatedRequirement[]>();
  for (const req of requirements) {
    const key = req.category_code ?? req.section_heading ?? "general";
    const list = byKey.get(key) ?? [];
    list.push(req);
    byKey.set(key, list);
  }
  return [...byKey.values()];
}

function mergeRequirements(group: ConsolidatedRequirement[]): ConsolidatedRequirement {
  // The priced position (if any) owns the title and structural metadata — it is
  // the most specific statement of the deliverable; otherwise the longest.
  const rep =
    group.find((g) => isOz(g.item_number)) ??
    [...group].sort((a, b) => b.description_en.length - a.description_en.length)[0]!;
  const id = [...group.map((g) => g.id)].sort()[0]!;

  const seenEn = new Set<string>();
  const partsEn: string[] = [];
  const seenDe = new Set<string>();
  const partsDe: string[] = [];
  for (const g of group) {
    const ke = norm(g.description_en);
    if (ke.length > 0 && !seenEn.has(ke)) {
      seenEn.add(ke);
      partsEn.push(g.description_en.trim());
    }
    if (g.description_de) {
      const kd = norm(g.description_de);
      if (kd.length > 0 && !seenDe.has(kd)) {
        seenDe.add(kd);
        partsDe.push(g.description_de.trim());
      }
    }
  }

  const priority = group.reduce<ConsolidatedRequirement["priority"]>(
    (best, g) => (PRIORITY_RANK[g.priority] > PRIORITY_RANK[best] ? g.priority : best),
    "optional",
  );
  // Most cautious confidence: a leaf assembled from an LLM judgement should not
  // claim more certainty than its weakest member.
  const confidence = group.reduce<ConsolidatedRequirement["confidence"]>(
    (worst, g) => (CONFIDENCE_RANK[g.confidence] < CONFIDENCE_RANK[worst] ? g.confidence : worst),
    "high",
  );
  const equivalence = group.map((g) => g.equivalence_allowed).find((v) => v !== null) ?? null;

  return {
    id,
    source_chunk_ids: [...new Set(group.flatMap((g) => g.source_chunk_ids))],
    merge_record: {
      rule: "semantic-link",
      mergeConfidence: "medium",
      evidenceLinks: group.flatMap((g) => g.merge_record.evidenceLinks),
      whyMerged: `Semantically linked as one deliverable: ${group.map((g) => g.bullet_point).join(" + ")}`,
    },
    bullet_point: rep.bullet_point,
    description_en: partsEn.join("\n\n"),
    description_de: partsDe.length > 0 ? partsDe.join("\n\n") : null,
    priority,
    equivalence_allowed: equivalence,
    confidence,
    standards: [...new Set(group.flatMap((g) => g.standards))],
    referenced_annexes: [...new Set(group.flatMap((g) => g.referenced_annexes))],
    category_code: rep.category_code,
    section_heading: rep.section_heading,
    item_number: rep.item_number,
    source_language: rep.source_language,
  };
}

export async function linkSemantic(
  requirements: ConsolidatedRequirement[],
  log: Logger,
): Promise<ConsolidatedRequirement[]> {
  const parent = new Map(requirements.map((r) => [r.id, r.id]));
  // Distinct OZ codes currently under each root — the guard reads this to refuse
  // any union that would put two priced positions in one leaf.
  const ozUnder = new Map<string, Set<string>>(
    requirements.map((r) => [r.id, new Set(isOz(r.item_number) ? [r.item_number!] : [])]),
  );
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root)! !== root) root = parent.get(root)!;
    let cur = x;
    while (parent.get(cur)! !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const tryUnion = (a: string, b: string): boolean => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return false;
    const combined = new Set([...ozUnder.get(ra)!, ...ozUnder.get(rb)!]);
    if (combined.size > 1) return false; // would fuse two priced positions — refused
    parent.set(ra, rb);
    ozUnder.set(rb, combined);
    return true;
  };

  const blocks = blocksFor(requirements);
  let pairs = 0;
  let calls = 0;
  let linked = 0;
  let capped = false;
  let aborted = false;
  let consecutiveErrors = 0;

  for (const block of blocks) {
    if (block.length < 2) continue;
    const candidates = candidatesWithin(block).slice(0, linkingConfig.maxPairsPerBlock);
    for (const { a, b, score } of candidates) {
      if (calls >= linkingConfig.maxDiscriminatorCalls) {
        capped = true;
        break;
      }
      if (find(a.id) === find(b.id)) continue; // already linked transitively
      pairs++;
      calls++;
      // Best-effort: a failed discriminator call leaves the pair unlinked; repeated
      // failures abort the pass and the pipeline continues.
      let verdict: z.infer<typeof DiscriminatorSchema>;
      try {
        verdict = await discriminate(a, b);
        consecutiveErrors = 0;
      } catch (err) {
        consecutiveErrors++;
        log.warn({ err, a: a.id, b: b.id }, "semantic-link discriminator call failed — pair left unlinked");
        if (consecutiveErrors >= 3) {
          aborted = true;
          break;
        }
        continue;
      }
      const same = verdict.relation === "same" && tryUnion(a.id, b.id);
      if (same) linked++;
      log.debug(
        {
          a: a.id,
          b: b.id,
          a_item: a.item_number,
          b_item: b.item_number,
          overlap: Number(score.toFixed(2)),
          relation: verdict.relation,
          linked: same,
          reason: verdict.reason,
        },
        "semantic-link discriminator decision",
      );
    }
    if (capped || aborted) break;
  }
  if (aborted) {
    log.error("semantic linking aborted after repeated discriminator failures — remaining pairs left unlinked");
  }

  // Rebuild: collapse each union group through the non-lossy merge.
  const groups = new Map<string, ConsolidatedRequirement[]>();
  for (const req of requirements) {
    const root = find(req.id);
    const list = groups.get(root) ?? [];
    list.push(req);
    groups.set(root, list);
  }
  const result: ConsolidatedRequirement[] = [];
  let mergedGroups = 0;
  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0]!);
      continue;
    }
    mergedGroups++;
    // Defence in depth: assert the guard held before we emit a merged leaf.
    const ozCodes = new Set(group.filter((g) => isOz(g.item_number)).map((g) => g.item_number!));
    if (ozCodes.size > 1) {
      log.error(
        { ozCodes: [...ozCodes] },
        "SAFETY: semantic link would merge distinct priced positions — emitting separately instead",
      );
      for (const g of group) result.push(g);
      mergedGroups--;
      continue;
    }
    result.push(mergeRequirements(group));
  }

  if (capped) {
    log.warn(
      { cap: linkingConfig.maxDiscriminatorCalls },
      "semantic linking hit the global discriminator cap — some pairs were not checked",
    );
  }
  log.info(
    {
      input: requirements.length,
      output: result.length,
      blocks: blocks.length,
      pairsChecked: pairs,
      discriminatorCalls: calls,
      linkedPairs: linked,
      mergedGroups,
    },
    "semantic linking complete",
  );
  return result;
}
