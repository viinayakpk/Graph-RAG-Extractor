import type { Logger } from "pino";
import type { DocumentProfile, ParsedDocument } from "../types/document.js";
import type { Chunk } from "../types/chunk.js";
import { sectionStrategy } from "./strategies/section.js";
import { positionStrategy } from "./strategies/position.js";
import { preambleStrategy } from "./strategies/preamble.js";

export async function chunk(
  doc: ParsedDocument,
  profile: DocumentProfile,
  log: Logger,
): Promise<Chunk[]> {
  log.info({ strategy: profile.suggestedStrategy, filename: doc.filename }, "chunking");

  switch (profile.suggestedStrategy) {
    case "section-list":
      return sectionStrategy(doc, log);

    case "lv-position":
      return positionStrategy(doc, log);

    case "vorbemerkungen-heavy":
      return preambleStrategy(doc, log);

    case "mixed": {
      const preamblePages = doc.pages.filter((p) => p.pageNumber <= 61);
      const roomPages = doc.pages.filter((p) => p.pageNumber > 61);
      const preambleDoc = { ...doc, pages: preamblePages };
      const roomDoc = { ...doc, pages: roomPages };
      const [preambleChunks, roomChunks] = await Promise.all([
        preambleStrategy(preambleDoc, log),
        positionStrategy(roomDoc, log),
      ]);
      return [...preambleChunks, ...roomChunks];
    }
  }
}
