import type { Logger } from "pino";
import { z } from "zod";
import type { ConsolidatedRequirement } from "../types/requirement.js";
import { buildClient, modelName } from "../extractor/client.js";
import type { Group } from "./group.js";

// Grouping turns the flat list of requirements into a named L1/L2 tree.
//
// Small tenders: one LLM call assigns every leaf — the model sees all the bullets
// and groups them semantically (best quality when it fits).
//
// Large tenders: a single classify-everything call overflows the model's output
// and fails (Salzburg, 2000+ leaves). So we follow the production taxonomy pattern
// (TnT-LLM / BERTopic): the leaves are already pre-clustered by the document's own
// structure (category_code / section_heading), so we *induce* a named taxonomy from
// those keys — a call bounded by the number of keys (~tens), not leaves — then
// assign every leaf by its key. This also honours the brief: we organise the
// document's real structure rather than inventing categories.
const INLINE_LIMIT = 150;

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 48);
}

async function callJson(system: string, user: string): Promise<string> {
  const client = buildClient();
  const response = await client.chat.completions.create({
    model: modelName(),
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return response.choices[0]?.message?.content ?? "{}";
}

// --- Small tenders: single-call grouping by leaf index ---------------------

const InlineSchema = z.object({
  level1: z
    .array(
      z.object({
        name: z.string().min(1),
        level2: z
          .array(z.object({ name: z.string().min(1), itemIndices: z.array(z.number().int().nonnegative()) }))
          .min(1),
      }),
    )
    .min(1)
    .max(12),
});

const INLINE_PROMPT = `You organise a tender's extracted requirements into a clean category tree.
Group the numbered requirements into 3-12 top-level categories (Level 1), using as many as the tender's complexity warrants — a handful is usually right. Title them as a human would title the sections of this tender (e.g. "Installation", "Maintenance", "Health & Safety", "Digital Booking Platform"). Do not use generic names like "Requirements" or codes like "Category 09".
The tree must be Mutually Exclusive and Collectively Exhaustive: every requirement index belongs to exactly one Level 2 sub-category, used exactly once.
Under each Level 1, create one or more Level 2 sub-categories — shallow where the tender is simple, deeper where it is rich.
Return JSON: {"level1":[{"name":"...","level2":[{"name":"...","itemIndices":[0,3,5]}]}]}`;

async function inlineGrouping(
  requirements: ConsolidatedRequirement[],
  log: Logger,
): Promise<Group[]> {
  const list = requirements.map((r, i) => `${i}: ${r.bullet_point}`).join("\n");
  const parsed = InlineSchema.parse(JSON.parse(await callJson(INLINE_PROMPT, `Requirements (${requirements.length}):\n${list}`)));

  const groups: Group[] = [];
  const assigned = new Set<number>();
  for (const l1 of parsed.level1) {
    for (const l2 of l1.level2) {
      const reqs: ConsolidatedRequirement[] = [];
      for (const idx of l2.itemIndices) {
        const req = requirements[idx];
        if (req && !assigned.has(idx)) {
          reqs.push(req);
          assigned.add(idx);
        }
      }
      if (reqs.length === 0) continue;
      groups.push({
        l1Key: slug(l1.name),
        l1Label: l1.name,
        l2Key: `${slug(l1.name)}__${slug(l2.name)}`,
        l2Label: l2.name,
        requirements: reqs,
      });
    }
  }
  appendOther(groups, requirements.filter((_, i) => !assigned.has(i)), log);
  log.info(
    { level1: parsed.level1.length, groups: groups.length, requirements: requirements.length, mode: "inline" },
    "LLM grouping: semantic groups discovered",
  );
  return groups;
}

// --- Large tenders: taxonomy induction over the document's grouping keys ----

// One assignment per category key: a human title for the category itself (its L2)
// and the broad theme it sits under (its L1). The document's categories ARE the L2
// layer — the model only names them and rolls them up into L1 themes, so it cannot
// lump distinct categories together and the tree stays fine-grained at any scale.
const InductionSchema = z.object({
  assignments: z
    .array(
      z.object({
        key: z.string().min(1),
        l1: z.string().min(1),
        l2: z.string().min(1),
      }),
    )
    .min(1),
});

const INDUCTION_PROMPT = `You name and group a tender's requirement CATEGORIES into a clean two-level tree.
You are given every category found in the document, each identified by a key and a few example requirements.
For EVERY category key, return one assignment with:
- "l2": a clean human title for THAT category alone (e.g. "Undercounter Cabinets", "Fume Hoods", "Gas Fittings"). Keep each category as its own sub-area; never output a code; never merge several categories under one title.
- "l1": the broad top-level theme the category belongs to (e.g. "Laboratory Furniture", "Media Supply", "Safety Equipment", "General Conditions").
Use roughly 4-8 distinct top-level themes for a tender of this size: group related categories under a shared theme, but never lump unrelated categories together. Reflect the document's own structure — do NOT invent categories the data does not imply.
Return JSON: {"assignments":[{"key":"<category key>","l2":"...","l1":"..."}]}`;

// A leaf's natural cluster: its structure-derived category, else its section, else
// a single shared bucket. This is the pre-clustering the induction rolls up.
function groupKey(req: ConsolidatedRequirement): string {
  return req.category_code ?? req.section_heading ?? "general";
}

async function inducedGrouping(
  requirements: ConsolidatedRequirement[],
  log: Logger,
): Promise<Group[]> {
  const byKey = new Map<string, ConsolidatedRequirement[]>();
  for (const req of requirements) {
    const key = groupKey(req);
    const list = byKey.get(key) ?? [];
    list.push(req);
    byKey.set(key, list);
  }
  const keys = [...byKey.keys()];

  const catalogue = keys
    .map((key) => {
      const reqs = byKey.get(key)!;
      const examples = reqs.slice(0, 3).map((r) => r.bullet_point).join(" | ");
      return `- "${key}" (${reqs.length} items): ${examples}`;
    })
    .join("\n");

  const parsed = InductionSchema.parse(JSON.parse(await callJson(INDUCTION_PROMPT, `Categories (${keys.length}):\n${catalogue}`)));

  // key -> {l1, l2}, first assignment wins. One named node per category key.
  const keyToNode = new Map<string, { l1: string; l2: string }>();
  for (const a of parsed.assignments) {
    if (!keyToNode.has(a.key)) keyToNode.set(a.key, { l1: a.l1, l2: a.l2 });
  }

  // Each category key becomes its own L2 node (unique l2Key), placed under the
  // theme the model named. The L2 layer is therefore always as fine-grained as the
  // document's categories, regardless of how many L1 themes the model chooses.
  const groups: Group[] = [];
  const leftover: ConsolidatedRequirement[] = [];
  for (const [key, reqs] of byKey) {
    const node = keyToNode.get(key);
    if (!node) {
      leftover.push(...reqs);
      continue;
    }
    groups.push({
      l1Key: slug(node.l1),
      l1Label: node.l1,
      l2Key: `${slug(node.l1)}__${slug(key)}`,
      l2Label: node.l2,
      requirements: reqs,
    });
  }
  appendOther(groups, leftover, log);
  const level1Count = new Set(groups.map((g) => g.l1Key)).size;
  log.info(
    {
      keys: keys.length,
      level1: level1Count,
      level2: groups.length,
      requirements: requirements.length,
      unassignedKeys: keys.length - keyToNode.size,
      mode: "induced",
    },
    "LLM grouping: taxonomy induced from document categories",
  );
  return groups;
}

// Collectively exhaustive: anything unassigned goes into one honest bucket.
function appendOther(groups: Group[], leftover: ConsolidatedRequirement[], log: Logger): void {
  if (leftover.length === 0) return;
  log.warn({ unassigned: leftover.length }, "grouping left requirements unassigned — bucketed as Other");
  groups.push({
    l1Key: "other",
    l1Label: "Other Requirements",
    l2Key: "other__general",
    l2Label: "General",
    requirements: leftover,
  });
}

// Discover semantic L1/L2 groupings. Returns null on any failure so the caller
// falls back to deterministic mechanical grouping.
export async function discoverGroupingLlm(
  requirements: ConsolidatedRequirement[],
  log: Logger,
): Promise<Group[] | null> {
  if (requirements.length === 0) return null;
  try {
    return requirements.length > INLINE_LIMIT
      ? await inducedGrouping(requirements, log)
      : await inlineGrouping(requirements, log);
  } catch (err) {
    log.warn({ err }, "LLM grouping failed — falling back to mechanical grouping");
    return null;
  }
}
