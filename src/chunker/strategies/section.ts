import type { Logger } from "pino";
import type { ParsedDocument } from "../../types/document.js";
import type { Chunk } from "../../types/chunk.js";
import { slugify } from "../utils.js";
import { exceedsTokenLimit } from "../guard.js";

// All-caps section headings, e.g. "INSTALLATION", "MAINTENANCE", "CONTRACT HEALTH & SAFETY"
const SECTION_HEADING_RE = /^([A-Z][A-Z\s&]{3,})$/;

// Numbered list item — the number sits alone on its line: "1." or "10."
const NUMBERED_ITEM_RE = /^(\d{1,2})\.\s*$/;

interface Line {
  text: string;
  pageNumber: number;
}

function allLines(doc: ParsedDocument): Line[] {
  const result: Line[] = [];
  for (const page of doc.pages) {
    for (const line of page.cleanedText.split("\n")) {
      const text = line.trim();
      if (text) result.push({ text, pageNumber: page.pageNumber });
    }
  }
  return result;
}

interface Section {
  heading: string;
  startPage: number;
  lines: Line[];
}

function splitIntoSections(lines: Line[], startPage: number): Section[] {
  const sections: Section[] = [];
  let current: Section = { heading: "Administrative Requirements", startPage, lines: [] };

  for (const line of lines) {
    if (SECTION_HEADING_RE.test(line.text) && line.text.length <= 60) {
      if (current.lines.length > 0) sections.push(current);
      current = { heading: line.text, startPage: line.pageNumber, lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.length > 0) sections.push(current);
  return sections;
}

function makeChunk(
  slug: string,
  source_file: string,
  index: number,
  section: string,
  pageNumber: number,
  content: string
): Chunk {
  const sectionSlug = section.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    chunk_id: `${slug}__sec${sectionSlug}__i${index}`,
    source_file,
    page_number: pageNumber,
    section_heading: section,
    lv_position: null,
    document_region: "section",
    category_code: null,
    content,
  };
}

export function sectionStrategy(doc: ParsedDocument, log: Logger): Chunk[] {
  const slug = slugify(doc.filename);
  const source_file = doc.filename;
  const lines = allLines(doc);
  const startPage = doc.pages[0]?.pageNumber ?? 1;
  const sections = splitIntoSections(lines, startPage);

  log.info({ source_file, sectionCount: sections.length }, "section strategy: splitting by heading");

  const chunks: Chunk[] = [];
  let index = 0;

  for (const section of sections) {
    const hasNumberedItems = section.lines.some((l) => NUMBERED_ITEM_RE.test(l.text));

    if (hasNumberedItems) {
      // Emit one chunk per numbered item
      let itemNum: string | null = null;
      let itemLines: Line[] = [];
      let itemPage = section.startPage;

      const flush = () => {
        if (itemNum === null || itemLines.length === 0) return;
        const body = itemLines.map((l) => l.text).filter(Boolean).join("\n");
        if (!body.trim()) return;
        chunks.push(
          makeChunk(
            slug, source_file, index++, section.heading, itemPage,
            `${section.heading}\nItem ${itemNum}: ${body}`
          )
        );
      };

      for (const line of section.lines) {
        const match = NUMBERED_ITEM_RE.exec(line.text);
        if (match) {
          flush();
          itemNum = match[1] ?? null;
          itemLines = [];
          itemPage = line.pageNumber;
        } else {
          itemLines.push(line);
        }
      }
      flush();
    } else {
      // Keep whole section as one chunk; split on double-newline if over token limit
      const body = section.lines.map((l) => l.text).filter(Boolean).join("\n").trim();
      if (!body) continue;

      const content = `${section.heading}\n${body}`;
      if (!exceedsTokenLimit(content)) {
        chunks.push(makeChunk(slug, source_file, index++, section.heading, section.startPage, content));
      } else {
        for (const para of body.split(/\n{2,}/)) {
          const trimmed = para.trim();
          if (!trimmed) continue;
          chunks.push(
            makeChunk(slug, source_file, index++, section.heading, section.startPage,
              `${section.heading}\n${trimmed}`)
          );
        }
      }
    }
  }

  log.info({ source_file, chunkCount: chunks.length }, "section strategy: complete");
  return chunks;
}
