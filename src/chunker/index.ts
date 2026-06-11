import type { Logger } from "pino";
import type { DocumentProfile, ParsedDocument } from "../types/document.js";
import type { Chunk } from "../types/chunk.js";
import { sectionStrategy } from "./strategies/section.js";
import { positionStrategy } from "./strategies/position.js";
import { preambleStrategy } from "./strategies/preamble.js";
import { OZ_3PART_RE, OZ_5PART_ALPHA_RE } from "../parser/oz-patterns.js";

// Room-position OZ codes occupying a whole line (anchored), e.g. "01.01.0010" or
// "GU.07.09.01.01". Vorbemerkungen codes (00.00.00.*) match neither.
const OZ_3PART_LINE = new RegExp(`^${OZ_3PART_RE.source}$`);
const OZ_5PART_ALPHA_LINE = new RegExp(`^${OZ_5PART_ALPHA_RE.source}$`);

// First page that starts a room-position block — the structural point where a
// mixed document leaves the vorbemerkungen preamble and enters room positions.
function findFirstRoomPositionPage(doc: ParsedDocument): number | null {
  for (const page of doc.pages) {
    for (const rawLine of page.cleanedText.split("\n")) {
      const line = rawLine.trim();
      if (OZ_3PART_LINE.test(line) || OZ_5PART_ALPHA_LINE.test(line)) {
        return page.pageNumber;
      }
    }
  }
  return null;
}

// Where to split a mixed document into preamble vs. room positions. Read from the
// document itself (the page where room positions begin), not guessed from page
// count. Falls back to the profiler's sampled estimate, then to "all preamble" —
// never a fixed ratio that only happens to fit one tender.
function resolvePreambleBoundary(
  doc: ParsedDocument,
  profile: DocumentProfile,
  log: Logger,
): number {
  const firstRoomPage = findFirstRoomPositionPage(doc);
  if (firstRoomPage !== null) {
    log.info(
      { boundary: firstRoomPage - 1, firstRoomPage, source: "document" },
      "mixed chunker: boundary derived from where room positions begin",
    );
    return firstRoomPage - 1;
  }
  if (profile.preambleBoundaryPage !== null) {
    log.info(
      { boundary: profile.preambleBoundaryPage, source: "profiler-sample" },
      "mixed chunker: using profiler boundary estimate",
    );
    return profile.preambleBoundaryPage;
  }
  log.warn(
    { boundary: doc.pageCount, source: "fallback" },
    "mixed chunker: no room positions found — treating all pages as preamble",
  );
  return doc.pageCount;
}

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
      const boundary = resolvePreambleBoundary(doc, profile, log);
      const preamblePages = doc.pages.filter((p) => p.pageNumber <= boundary);
      const roomPages = doc.pages.filter((p) => p.pageNumber > boundary);
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
