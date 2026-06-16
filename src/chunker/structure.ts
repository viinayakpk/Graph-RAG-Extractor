import type { Logger } from "pino";
import type { DocumentProfile, ParsedDocument, TextLine } from "../types/document.js";
import type { Chunk, DocumentRegion } from "../types/chunk.js";
import { slugify } from "./utils.js";
import { isCancelledPosition, exceedsTokenLimit } from "./guard.js";
import { normalizeInline } from "../parser/normalize.js";
import { OZ_3PART_RE, OZ_5PART_ALPHA_RE, OZ_VORBEMERKUNGEN_RE } from "../parser/oz-patterns.js";
import { chunkerConfig, profilerConfig } from "../config.js";

// Structure-aware chunker: segments the geometry lines the way a human reads —
// headings open sections, a label leading a line opens an item, everything else is
// body. OZ codes are one kind of label, enriched with lv_position/category.

interface OzLabel {
  code: string;
  region: DocumentRegion;
  lv_position: string | null;
  category_code: string | null;
}

const OZ_VORB_START = new RegExp(`^(${OZ_VORBEMERKUNGEN_RE.source})(?:\\s|$)`);
const OZ_5PART_START = new RegExp(`^(${OZ_5PART_ALPHA_RE.source})(?:\\s|$)`);
const OZ_3PART_START = new RegExp(`^(${OZ_3PART_RE.source})(?:\\s|$)`);

// An OZ code leading a line → a position/preamble item with derived enrichment.
function ozLabelAt(text: string): OzLabel | null {
  const vorb = OZ_VORB_START.exec(text);
  if (vorb) {
    const kk = vorb[1]!.split(".")[3]!;
    return { code: vorb[1]!, region: "vorbemerkungen", lv_position: null, category_code: kk === "00" ? null : kk };
  }
  const alpha = OZ_5PART_START.exec(text);
  if (alpha) {
    const cc = alpha[1]!.split(".")[2]!;
    return { code: alpha[1]!, region: "lv-position", lv_position: alpha[1]!, category_code: cc };
  }
  const three = OZ_3PART_START.exec(text);
  if (three) {
    return { code: three[1]!, region: "lv-position", lv_position: three[1]!, category_code: null };
  }
  return null;
}

// A generic list-item leader ("1.", "10)", "a)", "3.2.1", a bullet) with following text.
const GENERIC_ITEM_RE = /^(\d{1,3}(?:\.\d{1,3})+|\d{1,3}[.)]|[A-Za-z][.)]|[•·*•])\s+\S/;
function genericItemLabel(text: string): string | null {
  const m = GENERIC_ITEM_RE.exec(text);
  return m ? m[1]!.replace(/[.)]+$/, "") : null;
}

// LV group/subgroup header: a short 1- or 2-segment numeric code followed by a title.
const GROUP_HEADER_RE = /^\d{2}(?:\.\d{2})?\s+\p{Lu}[\p{L} ./&-]{2,}$/u;

function isCapsHeading(text: string): boolean {
  if (text.length < 4 || text.length > chunkerConfig.maxHeadingLength) return false;
  if (/[.,:;]$/.test(text)) return false;
  const letters = text.replace(/[^\p{L}]/gu, "");
  return letters.length >= 3 && letters === letters.toUpperCase();
}

function isHeading(line: TextLine, text: string, bodyFontSize: number): boolean {
  if (line.fontSize >= bodyFontSize * 1.2) return true; // larger font (titles)
  if (isCapsHeading(text)) return true; // ALL-CAPS section labels
  if (GROUP_HEADER_RE.test(text)) return true; // LV group/subgroup headers
  return false;
}

function modeFontSize(doc: ParsedDocument): number {
  const counts = new Map<number, number>();
  for (const page of doc.pages) {
    for (const line of page.lines) {
      // Round to 0.1pt so body 9.5pt and a 10pt heading stay in separate buckets.
      const size = Math.round(line.fontSize * 10) / 10;
      counts.set(size, (counts.get(size) ?? 0) + 1);
    }
  }
  let mode = 10;
  let best = 0;
  for (const [size, count] of counts) {
    if (count > best) {
      best = count;
      mode = size;
    }
  }
  return mode;
}

// Digit-normalized key so a footer with a varying page number still matches.
function pageKey(text: string): string {
  return text.replace(/\d+/g, "#");
}

// Lines that repeat on most pages are running headers/footers. Computed from the
// same geometry lines the chunker consumes, so the match is exact.
function repeatedLineSet(doc: ParsedDocument): Set<string> {
  const pageCountByKey = new Map<string, number>();
  for (const page of doc.pages) {
    const seen = new Set<string>();
    for (const line of page.lines) {
      const text = normalizeInline(line.text).trim();
      if (text.length < 4) continue;
      const key = pageKey(text);
      if (seen.has(key)) continue;
      seen.add(key);
      pageCountByKey.set(key, (pageCountByKey.get(key) ?? 0) + 1);
    }
  }
  const minPages = Math.max(2, Math.ceil(doc.pages.length * profilerConfig.repeatedHeaderPageFraction));
  const repeated = new Set<string>();
  for (const [key, count] of pageCountByKey) {
    if (count >= minPages) repeated.add(key);
  }
  return repeated;
}

// Pure LV pricing-column label lines ("EUR PP EUR EP", "EUR SO", "LO") — no
// digits, so quantity lines like "ST 1,00" are kept.
const LV_COLUMN_NOISE = /^(?:EUR|PP|EP|SO|ST|LO|LM)(?:\s+(?:EUR|PP|EP|SO|ST|LO|LM))*$/;

function splitToBudget(lines: string[]): string[] {
  const parts: string[] = [];
  let buffer: string[] = [];
  for (const line of lines) {
    buffer.push(line);
    if (exceedsTokenLimit(buffer.join("\n")) && buffer.length > 1) {
      buffer.pop();
      parts.push(buffer.join("\n"));
      buffer = [line];
    }
  }
  if (buffer.length > 0) parts.push(buffer.join("\n"));
  return parts;
}

interface OpenItem {
  oz: OzLabel | null;
  label: string;
  heading: string;
  page: number;
  lines: string[];
}

export function structureChunk(
  doc: ParsedDocument,
  profile: DocumentProfile,
  log: Logger,
): Chunk[] {
  const slug = slugify(doc.filename);
  const source_file = doc.filename;
  const bodyFontSize = modeFontSize(doc);
  const repeated = repeatedLineSet(doc);
  const stripLvNoise = profile.suggestedStrategy !== "section-list";

  const chunks: Chunk[] = [];
  let seq = 0;

  const emit = (
    region: DocumentRegion,
    lvPosition: string | null,
    categoryCode: string | null,
    heading: string | null,
    page: number,
    label: string,
    lines: string[],
  ): void => {
    const content = lines.filter((l) => l.length > 0).join("\n").trim();
    if (!content || isCancelledPosition(content)) return;
    const labelSlug = label.replace(/[^a-zA-Z0-9]+/g, "_");
    for (const part of splitToBudget(content.split("\n"))) {
      if (!part.trim()) continue;
      chunks.push({
        chunk_id: `${slug}__${region}_${labelSlug}__i${seq++}`,
        source_file,
        page_number: page,
        section_heading: heading,
        lv_position: lvPosition,
        document_region: region,
        category_code: categoryCode,
        content: part,
      });
    }
  };

  let heading: string = chunkerConfig.defaultSectionHeading;
  let item: OpenItem | null = null;
  let sectionLines: string[] = [];
  let sectionPage = doc.pages[0]?.pageNumber ?? 1;

  const flushItem = (): void => {
    if (item) {
      emit(item.oz?.region ?? "section", item.oz?.lv_position ?? null, item.oz?.category_code ?? null, item.heading, item.page, item.label, item.lines);
      item = null;
    }
  };
  const flushSection = (): void => {
    if (sectionLines.length > 0) {
      emit("section", null, null, heading, sectionPage, "sec", [heading, ...sectionLines]);
      sectionLines = [];
    }
  };

  for (const page of doc.pages) {
    for (const line of page.lines) {
      const text = normalizeInline(line.text).trim();
      if (!text || repeated.has(pageKey(text))) continue;
      if (stripLvNoise && LV_COLUMN_NOISE.test(text)) continue;

      if (isHeading(line, text, bodyFontSize)) {
        flushItem();
        flushSection();
        heading = text;
        sectionPage = page.pageNumber;
        continue;
      }

      const oz = ozLabelAt(text);
      const genericLabel = oz ? null : genericItemLabel(text);
      if (oz || genericLabel) {
        flushItem();
        flushSection();
        item = { oz, label: oz?.code ?? genericLabel!, heading, page: page.pageNumber, lines: [text] };
        continue;
      }

      if (item) {
        item.lines.push(text);
      } else {
        if (sectionLines.length === 0) sectionPage = page.pageNumber;
        sectionLines.push(text);
      }
    }
  }
  flushItem();
  flushSection();

  const byRegion: Record<string, number> = {};
  for (const c of chunks) byRegion[c.document_region] = (byRegion[c.document_region] ?? 0) + 1;
  log.info(
    { source_file, chunkCount: chunks.length, byRegion, bodyFontSize, repeatedHeaders: repeated.size },
    "structure chunker: complete",
  );
  return chunks;
}
