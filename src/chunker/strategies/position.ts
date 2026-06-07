import type { Logger } from "pino";
import type { ParsedDocument } from "../../types/document.js";
import type { Chunk } from "../../types/chunk.js";
import { slugify } from "../utils.js";
import { isEntfallt } from "../guard.js";

// Full OZ position — must match the entire trimmed line (no partial matches)
// Fahrradgaragen: 01.01.0010
// Salzburg rooms: GU.07.01.01.01
const OZ_FAHRRAD_RE = /^(\d{2}\.\d{2}\.\d{4})$/;
const OZ_SALZBURG_RE = /^([A-Z]{2}\.\d{2}\.\d{2}\.\d{2}\.\d{2})$/;

// Salzburg Obergruppe code: third dot-separated segment of a 5-part OZ
// GU.07.09.01.01 → split(".") → index 2 → "09"
function extractCategoryCode(oz: string): string | null {
  const parts = oz.split(".");
  if (parts.length === 5 && /^[A-Z]{2}$/.test(parts[0] ?? "")) {
    return parts[2] ?? null;
  }
  return null;
}

interface Block {
  oz: string;
  pageNumber: number;
  lines: string[];
}

export function positionStrategy(doc: ParsedDocument, log: Logger): Chunk[] {
  const slug = slugify(doc.filename);
  const source_file = doc.filename;
  const chunks: Chunk[] = [];
  let seqIndex = 0;

  // Collect all non-empty cleaned lines with their page numbers
  const allLines: Array<{ text: string; pageNumber: number }> = [];
  for (const page of doc.pages) {
    for (const line of page.cleanedText.split("\n")) {
      const text = line.trim();
      if (text) allLines.push({ text, pageNumber: page.pageNumber });
    }
  }

  // Walk lines, detect OZ boundaries, collect content blocks
  let current: Block | null = null;

  const emit = () => {
    if (!current || current.lines.length === 0) return;
    const content = current.lines.join("\n");
    if (isEntfallt(content)) {
      log.debug({ source_file, oz: current.oz }, "skipping Entfällt position");
      return;
    }
    const ozSlug = current.oz.replace(/\./g, "_");
    chunks.push({
      chunk_id: `${slug}__oz${ozSlug}__i${seqIndex++}`,
      source_file,
      page_number: current.pageNumber,
      section_heading: null,
      lv_position: current.oz,
      document_region: "lv-position",
      category_code: extractCategoryCode(current.oz),
      content,
    });
  };

  for (const { text, pageNumber } of allLines) {
    const fahrradMatch = OZ_FAHRRAD_RE.exec(text);
    const salzburgMatch = OZ_SALZBURG_RE.exec(text);
    const oz = (fahrradMatch ?? salzburgMatch)?.[1];

    if (oz) {
      emit();
      current = { oz, pageNumber, lines: [text] };
    } else if (current) {
      current.lines.push(text);
    }
  }
  emit();

  log.info({ source_file, chunkCount: chunks.length }, "position strategy: complete");
  return chunks;
}
