import type { Logger } from "pino";
import type { ParsedDocument } from "../../types/document.js";
import type { Chunk } from "../../types/chunk.js";

// All-caps section headings in section-list documents (e.g., Christmas tender)
const SECTION_HEADING_RE = /^[A-Z][A-Z\s&]{3,}$/m;
const NUMBERED_ITEM_RE = /^(\d+)\.\s+(.+)/m;

export function sectionStrategy(doc: ParsedDocument, log: Logger): Chunk[] {
  log.info({ filename: doc.filename }, "applying section-list strategy");
  // TODO: implement — split pages by SECTION_HEADING_RE, then by NUMBERED_ITEM_RE
  // Admin pages (pp.1-2, pp.4-5 in Christmas) get section_heading = "Administrative Requirements"
  throw new Error("section strategy not implemented");
}
