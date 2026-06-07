import type { Logger } from "pino";
import type { ParsedDocument } from "../../types/document.js";
import type { Chunk } from "../../types/chunk.js";
import { slugify } from "../utils.js";
import { exceedsTokenLimit } from "../guard.js";

// Salzburg vorbemerkungen position: 00.00.00.KK.II (full line, 5-segment, starts with triple zero)
// KK = Obergruppe code (e.g. "09" = Digestorien), II = item within that category
const VORB_OZ_RE = /^(00\.00\.00\.(\d{2})\.\d{2})$/;

interface Block {
  oz: string;
  categoryCode: string | null;
  pageNumber: number;
  lines: string[];
}

export function preambleStrategy(doc: ParsedDocument, log: Logger): Chunk[] {
  const slug = slugify(doc.filename);
  const source_file = doc.filename;
  const chunks: Chunk[] = [];
  let seqIndex = 0;

  const allLines: Array<{ text: string; pageNumber: number }> = [];
  for (const page of doc.pages) {
    for (const line of page.cleanedText.split("\n")) {
      const text = line.trim();
      if (text) allLines.push({ text, pageNumber: page.pageNumber });
    }
  }

  let current: Block | null = null;

  const emit = () => {
    if (!current || current.lines.length === 0) return;
    const ozSlug = current.oz.replace(/\./g, "_");
    const baseId = `${slug}__vorb${ozSlug}`;
    const rawContent = current.lines.join("\n");

    if (exceedsTokenLimit(rawContent)) {
      // Split at paragraph boundaries, include OZ header in first sub-chunk only
      const paragraphs = rawContent.split(/\n{2,}/);
      for (const para of paragraphs) {
        const trimmed = para.trim();
        if (!trimmed) continue;
        chunks.push({
          chunk_id: `${baseId}__i${seqIndex++}`,
          source_file,
          page_number: current.pageNumber,
          section_heading: current.oz,
          lv_position: null,
          document_region: "vorbemerkungen",
          category_code: current.categoryCode,
          content: trimmed,
        });
      }
    } else {
      chunks.push({
        chunk_id: `${baseId}__i${seqIndex++}`,
        source_file,
        page_number: current.pageNumber,
        section_heading: current.oz,
        lv_position: null,
        document_region: "vorbemerkungen",
        category_code: current.categoryCode,
        content: rawContent,
      });
    }
  };

  for (const { text, pageNumber } of allLines) {
    const match = VORB_OZ_RE.exec(text);
    if (match) {
      emit();
      const rawCode = match[2] ?? null;
      // Category code "00" is general preamble (not category-specific) — treat as null
      const categoryCode = rawCode === "00" ? null : rawCode;
      current = { oz: match[1]!, categoryCode, pageNumber, lines: [text] };
    } else if (current) {
      current.lines.push(text);
    }
  }
  emit();

  log.info({ source_file, chunkCount: chunks.length }, "preamble strategy: complete");
  return chunks;
}
