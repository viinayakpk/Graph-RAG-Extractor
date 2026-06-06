import type { Logger } from "pino";
import type { ParsedDocument } from "../../types/document.js";
import type { Chunk } from "../../types/chunk.js";

// Matches Fahrradgaragen OZ: 01.01.0010 and Salzburg room OZ: GU.07.09.01.01
const OZ_POSITION_RE = /^(?:\d{2}\.\d{2}\.\d{4}|[A-Z]{2}\.\d{2}\.\d{2}\.\d{2}\.\d{2})/m;

export function positionStrategy(doc: ParsedDocument, log: Logger): Chunk[] {
  log.info({ filename: doc.filename, pageCount: doc.pages.length }, "applying lv-position strategy");
  // TODO: implement — detect OZ boundaries, one chunk per position block
  // Guard: skip any block matching isEntfallt()
  // chunk_id = "{slug}__oz{oz}__i{seqIndex}"
  // category_code = third segment of Salzburg OZ, null for Fahrradgaragen OZ
  throw new Error("position strategy not implemented");
}
