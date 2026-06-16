import type { Logger } from "pino";
import type {
  ChunkExtraction,
  ConsolidatedRequirement,
  MergeRecord,
} from "../types/requirement.js";
import { OZ_LINE_RE } from "../parser/oz-patterns.js";
import { exactMatchMergeRecord } from "./rules/exact-match.js";
import { dedupMergeRecord } from "./rules/dedup.js";
import { preambleCategoryMergeRecord } from "./rules/preamble-category.js";

// ---------------------------------------------------------------------------
// Consolidation turns per-chunk extractions into distinct requirements, pulling
// every chunk that describes the same requirement onto one node. The hard rule:
// a single chunk may be a source for *several* requirements (a vorbemerkungen
// block states many specs; a room position is evidence for every spec of its
// category), so we never partition chunks "one to one requirement".
//
// Stages:
//   1. Category consolidation (Salzburg): each vorbemerkungen spec becomes its
//      own leaf and collects all room-position chunk IDs of its category.
//   2. Identity merge (everything else): union-find over extractions that are the
//      same requirement — same OZ position split across pages, or exact textual
//      duplicates within one section.
//   3. Cross-reference linking: distinct requirements that name each other's OZ
//      are *linked* (audit evidence), never merged.
// ---------------------------------------------------------------------------

const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 } as const;
const PRIORITY_RANK = { must: 3, should: 2, optional: 1 } as const;

// One extraction with a stable, unique key. A chunk can yield several
// extractions, so the chunk_id alone is not unique — `${chunk_id}#${i}` is.
// `order` is the extraction's position in document reading order, used to pick a
// requirement's leading statement for the leaf title.
interface Unit extends ChunkExtraction {
  unitKey: string;
  order: number;
}

const unique = (xs: string[]): string[] => [...new Set(xs)];

const normalize = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();

// An OZ position code is globally unique (e.g. "01.01.0010", "GU.07.09.01.01").
// A bare section item number ("3") is not — scoping identity merges to OZ codes
// stops unrelated section items that share a number from being fused. Anchored
// (OZ_LINE_RE) so a value like "01.01.0010 — see §3" is not treated as an OZ.
function isOzPosition(itemNumber: string | null): boolean {
  if (!itemNumber) return false;
  return OZ_LINE_RE.test(itemNumber);
}

function assignUnitKeys(extractions: ChunkExtraction[]): Unit[] {
  const seenPerChunk = new Map<string, number>();
  return extractions.map((ext, idx) => {
    const i = seenPerChunk.get(ext.chunk_id) ?? 0;
    seenPerChunk.set(ext.chunk_id, i + 1);
    return { ...ext, unitKey: `${ext.chunk_id}#${i}`, order: idx };
  });
}

// Among extractions that describe the same requirement, the representative
// supplies the body fields: the fullest description first (most complete statement
// of the requirement), then highest confidence as a tiebreak. Priority takes the
// strongest across the group (if any source says "must", the merged requirement is
// "must"); standards/annexes are unioned. Nothing is lost: every source chunk is
// still listed in source_chunk_ids.
function pickRepresentative(units: Unit[]): Unit {
  return [...units].sort((a, b) => {
    const byLength = b.description_en.length - a.description_en.length;
    if (byLength !== 0) return byLength;
    return CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
  })[0]!;
}

// The leaf TITLE comes from the requirement's leading statement in document order,
// not its longest paragraph. For an LV position split into sub-blocks (e.g. a
// garage stated with a long "gravel roof" sub-spec), "fullest description" would
// wrongly title the leaf after the sub-block; the leading extraction is the
// position's own descriptor. The representative still supplies the description.
function leadUnit(units: Unit[]): Unit {
  return units.reduce((earliest, u) => (u.order < earliest.order ? u : earliest));
}

// Significant words (length > 3) and separator-normalized numbers of a string —
// used to detect a restated sub-clause that adds nothing new.
function sigTokens(s: string): string[] {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").split(/\s+/).filter((t) => t.length > 3);
}
function numbersOf(s: string): string[] {
  return (s.match(/\d[\d.,]*/g) ?? []).map((n) => n.replace(/[.,]+$/, "").replace(/[.,]/g, ""));
}

// When several extractions are unioned into one requirement — a single LV position
// the model split into sub-specs (garage body, roof, door, load ratings), or a
// deliverable named on one page and specced on another — keep every description
// that adds something, in document order. Picking only the "fullest" single
// description silently dropped the others (e.g. the garage's dimensions and load
// ratings). A later part is skipped only when it is a restatement — its words are
// almost entirely already present AND it introduces no new number. The number
// guard is the safety rule: a part carrying any value not yet seen is always kept,
// so no dimension, quantity, or tolerance can ever be lost to dedup. This only
// drops redundant text; it never alters a value. A lone unit is returned unchanged.
function joinDescriptions(units: Unit[], pick: (u: Unit) => string | null): string | null {
  const seen = new Set<string>();
  const accTokens = new Set<string>();
  const accNumbers = new Set<string>();
  const parts: string[] = [];
  for (const u of [...units].sort((a, b) => a.order - b.order)) {
    const value = pick(u);
    if (!value) continue;
    const key = normalize(value);
    if (key.length === 0 || seen.has(key)) continue;

    const tokens = sigTokens(value);
    const numbers = numbersOf(value);
    const overlap = tokens.length === 0 ? 1 : tokens.filter((t) => accTokens.has(t)).length / tokens.length;
    const introducesNumber = numbers.some((n) => !accNumbers.has(n));
    if (parts.length > 0 && overlap >= 0.85 && !introducesNumber) continue; // redundant restatement

    seen.add(key);
    parts.push(value.trim());
    for (const t of tokens) accTokens.add(t);
    for (const n of numbers) accNumbers.add(n);
  }
  return parts.length > 0 ? parts.join("\n\n") : null;
}

function strongestPriority(units: Unit[]): ChunkExtraction["priority"] {
  return units.reduce<ChunkExtraction["priority"]>(
    (best, u) => (PRIORITY_RANK[u.priority] > PRIORITY_RANK[best] ? u.priority : best),
    "optional",
  );
}

function buildRequirement(
  id: string,
  contentUnits: Unit[],
  sourceChunkIds: string[],
  mergeRecord: MergeRecord,
): ConsolidatedRequirement {
  const rep = pickRepresentative(contentUnits);
  const lead = leadUnit(contentUnits);
  return {
    id,
    source_chunk_ids: sourceChunkIds,
    merge_record: mergeRecord,
    bullet_point: lead.bullet_point,
    description_en: joinDescriptions(contentUnits, (u) => u.description_en) ?? rep.description_en,
    description_de: joinDescriptions(contentUnits, (u) => u.description_de),
    priority: strongestPriority(contentUnits),
    equivalence_allowed: rep.equivalence_allowed,
    confidence: rep.confidence,
    standards: unique(contentUnits.flatMap((u) => u.standards)),
    referenced_annexes: unique(contentUnits.flatMap((u) => u.referenced_annexes)),
    category_code: rep.category_code,
    section_heading: rep.section_heading,
    item_number: rep.item_number,
    source_language: rep.source_language,
  };
}

// --- Stage 1: Salzburg category consolidation -----------------------------

interface CategoryResult {
  requirements: ConsolidatedRequirement[];
  emittedUnitKeys: Set<string>; // preamble specs already emitted as leaves
  consumedChunkIds: Set<string>; // room placements absorbed as evidence, not leaves
}

function buildCategoryRequirements(
  units: Unit[],
  crossRefsByReqId: Map<string, string[]>,
  log: Logger,
): CategoryResult {
  const requirements: ConsolidatedRequirement[] = [];
  const emittedUnitKeys = new Set<string>();
  const consumedChunkIds = new Set<string>();

  // category_code present, no OZ item_number → a vorbemerkungen spec.
  const specs = units.filter((u) => u.category_code && !isOzPosition(u.item_number));
  // category_code present, OZ item_number → a room position (a placement).
  const placements = units.filter((u) => u.category_code && isOzPosition(u.item_number));
  if (specs.length === 0) {
    return { requirements, emittedUnitKeys, consumedChunkIds };
  }

  const placementChunksByCategory = new Map<string, string[]>();
  for (const p of placements) {
    const list = placementChunksByCategory.get(p.category_code!) ?? [];
    list.push(p.chunk_id);
    placementChunksByCategory.set(p.category_code!, list);
  }

  for (const spec of specs) {
    const category = spec.category_code!;
    const placementChunkIds = unique(placementChunksByCategory.get(category) ?? []);
    const sourceChunkIds = unique([spec.chunk_id, ...placementChunkIds]);
    const record = preambleCategoryMergeRecord(category, [spec.chunk_id], placementChunkIds);

    requirements.push(buildRequirement(spec.unitKey, [spec], sourceChunkIds, record));
    crossRefsByReqId.set(spec.unitKey, unique(spec.cross_referenced_positions));
    emittedUnitKeys.add(spec.unitKey);

    // Room positions of this category are placements for the spec, not their own
    // leaves. Their chunk IDs are kept on the spec; they do not emit standalone.
    for (const id of placementChunkIds) consumedChunkIds.add(id);

    log.debug(
      { category_code: category, spec_chunk: spec.chunk_id, placements: placementChunkIds.length },
      "category spec consolidated with room placements",
    );
  }

  log.info(
    { specRequirements: requirements.length, consumedPlacementChunks: consumedChunkIds.size },
    "category consolidation complete",
  );
  return { requirements, emittedUnitKeys, consumedChunkIds };
}

// --- Stage 2: identity merge (union-find) ---------------------------------

class DisjointSet {
  private parent = new Map<string, string>();

  constructor(keys: string[]) {
    for (const key of keys) this.parent.set(key, key);
  }

  find(x: string): string {
    let root = x;
    while (this.parent.get(root)! !== root) root = this.parent.get(root)!;
    let cur = x;
    while (this.parent.get(cur)! !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }

  groups(): Map<string, string[]> {
    const out = new Map<string, string[]>();
    for (const key of this.parent.keys()) {
      const root = this.find(key);
      const list = out.get(root) ?? [];
      list.push(key);
      out.set(root, list);
    }
    return out;
  }
}

function recordForGroup(units: Unit[], chunkIds: string[]): MergeRecord {
  if (units.length === 1) {
    return {
      rule: "standalone",
      mergeConfidence: "high",
      evidenceLinks: [{ chunkId: units[0]!.chunk_id, evidenceRole: "general_spec" }],
      whyMerged: "Standalone requirement — no other chunk describes it",
    };
  }
  const oz = units.find((u) => isOzPosition(u.item_number))?.item_number;
  if (oz && units.every((u) => u.item_number === oz)) {
    return exactMatchMergeRecord(chunkIds, oz);
  }
  return dedupMergeRecord(chunkIds);
}

function consolidateRemaining(
  units: Unit[],
  crossRefsByReqId: Map<string, string[]>,
  log: Logger,
): ConsolidatedRequirement[] {
  const ds = new DisjointSet(units.map((u) => u.unitKey));

  // (a) Same OZ position appearing in multiple chunks → one requirement split
  //     across pages (e.g. a position named on one page, specced on another).
  const byOz = new Map<string, Unit[]>();
  for (const u of units) {
    if (!isOzPosition(u.item_number)) continue;
    const list = byOz.get(u.item_number!) ?? [];
    list.push(u);
    byOz.set(u.item_number!, list);
  }
  for (const group of byOz.values()) {
    for (let i = 1; i < group.length; i++) ds.union(group[0]!.unitKey, group[i]!.unitKey);
  }

  // (b) Exact textual duplicate within one section/category (e.g. staged delivery
  //     stated on two pages). OZ positions are excluded — they merge by identity
  //     above, so two distinct positions sharing a generic title never fuse.
  const byDuplicate = new Map<string, Unit[]>();
  for (const u of units) {
    if (isOzPosition(u.item_number)) continue;
    const key = `${normalize(u.bullet_point)}|${u.section_heading ?? u.category_code ?? ""}`;
    const list = byDuplicate.get(key) ?? [];
    list.push(u);
    byDuplicate.set(key, list);
  }
  for (const group of byDuplicate.values()) {
    if (group.length < 2) continue;
    for (let i = 1; i < group.length; i++) ds.union(group[0]!.unitKey, group[i]!.unitKey);
  }

  // (c) Entity resolution (Tier 1): the same spec repeated across positions — the
  //     same cabinet in 30 rooms under 30 OZ codes — is one requirement that cites
  //     all of its rooms, not 30 leaves. Block by category (compare like with like)
  //     and match on identical normalized description: identical text is the same
  //     spec, in any language, with no over-merge risk. The fuzzy residual
  //     (paraphrased / cross-language) is left for a later embedding pass.
  const byCanonical = new Map<string, Unit[]>();
  for (const u of units) {
    if (!u.category_code) continue; // structural block: only items carrying a category
    const key = `${u.category_code}|${normalize(u.description_en)}`;
    const list = byCanonical.get(key) ?? [];
    list.push(u);
    byCanonical.set(key, list);
  }
  for (const group of byCanonical.values()) {
    if (group.length < 2) continue;
    for (let i = 1; i < group.length; i++) ds.union(group[0]!.unitKey, group[i]!.unitKey);
  }

  const unitByKey = new Map(units.map((u) => [u.unitKey, u]));
  const requirements: ConsolidatedRequirement[] = [];

  for (const keys of ds.groups().values()) {
    const groupUnits = keys.map((k) => unitByKey.get(k)!);
    const id = [...keys].sort()[0]!; // smallest unitKey — stable, unique per group
    const chunkIds = unique(groupUnits.map((u) => u.chunk_id));
    requirements.push(buildRequirement(id, groupUnits, chunkIds, recordForGroup(groupUnits, chunkIds)));
    crossRefsByReqId.set(id, unique(groupUnits.flatMap((u) => u.cross_referenced_positions)));
  }

  log.info({ requirements: requirements.length }, "identity merge complete");
  return requirements;
}

// --- Stage 3: cross-reference linking (no merge) --------------------------

function linkCrossReferences(
  requirements: ConsolidatedRequirement[],
  crossRefsByReqId: Map<string, string[]>,
  log: Logger,
): void {
  // Where does each OZ position live? Map it to the requirement that carries it
  // and a chunk to cite as the link target.
  const ozToRequirement = new Map<string, { reqId: string; chunkId: string }>();
  for (const req of requirements) {
    if (isOzPosition(req.item_number)) {
      ozToRequirement.set(req.item_number!, { reqId: req.id, chunkId: req.source_chunk_ids[0]! });
    }
  }

  let links = 0;
  for (const req of requirements) {
    for (const oz of crossRefsByReqId.get(req.id) ?? []) {
      const target = ozToRequirement.get(oz);
      if (!target || target.reqId === req.id) continue;

      // Record the coupling as audit evidence only — the requirements stay
      // distinct, so the target's chunk is NOT added to source_chunk_ids.
      req.merge_record.evidenceLinks.push({ chunkId: target.chunkId, evidenceRole: "cross_reference" });
      req.merge_record.whyMerged += ` | references OZ ${oz}`;
      links++;
      log.debug({ from: req.id, references_oz: oz, target_req: target.reqId }, "cross-reference link added");
    }
  }
  log.info({ links }, "cross-reference linking complete");
}

// --- Orchestration --------------------------------------------------------

export function consolidate(
  extractions: ChunkExtraction[],
  log: Logger,
): ConsolidatedRequirement[] {
  log.info({ input: extractions.length }, "starting consolidation");

  const units = assignUnitKeys(extractions);
  const crossRefsByReqId = new Map<string, string[]>();

  const category = buildCategoryRequirements(units, crossRefsByReqId, log);

  const remaining = units.filter(
    (u) => !category.emittedUnitKeys.has(u.unitKey) && !category.consumedChunkIds.has(u.chunk_id),
  );
  const merged = consolidateRemaining(remaining, crossRefsByReqId, log);

  const requirements = [...category.requirements, ...merged];
  linkCrossReferences(requirements, crossRefsByReqId, log);

  log.info(
    {
      input: extractions.length,
      output: requirements.length,
      categorySpecs: category.requirements.length,
      consumedPlacementChunks: category.consumedChunkIds.size,
    },
    "consolidation complete",
  );
  return requirements;
}
