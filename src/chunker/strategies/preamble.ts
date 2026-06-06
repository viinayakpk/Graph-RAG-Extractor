import type { Logger } from "pino";
import type { ParsedDocument } from "../../types/document.js";
import type { Chunk } from "../../types/chunk.js";

// Salzburg Vorbemerkungen section heading pattern: "00.00.00.09 Digestorien"
const VORB_HEADING_RE = /^00\.00\.00\.(\d{2})\s+(.+)/m;

// Lookup: Salzburg category code → readable name
export const CATEGORY_NAMES: Record<string, string> = {
  "01": "Laborarbeitszeilen",
  "02": "Medienzellen",
  "03": "Arbeitsplatten",
  "04": "Unterschränke",
  "05": "Wandschränke",
  "06": "Mediakanäle",
  "07": "Aufbauten",
  "08": "Hochschränke",
  "09": "Digestorien",
  "10": "Verkleidungen",
  "11": "Labortische",
  "12": "Absauganlagen",
  "13": "Spülmaschine",
  "14": "Spülen",
  "15": "Flüssigkeitsauffangwannen",
  "16": "Sicherheitsschränke",
};

export function preambleStrategy(doc: ParsedDocument, log: Logger): Chunk[] {
  log.info({ filename: doc.filename, pageCount: doc.pages.length }, "applying preamble strategy");
  // TODO: implement — split at VORB_HEADING_RE boundaries
  // Each section → one chunk; apply exceedsTokenLimit() guard with recursive split
  // chunk_id = "{slug}__vorb{categoryCode}__i{seqIndex}"
  // document_region = "vorbemerkungen"
  throw new Error("preamble strategy not implemented");
}
