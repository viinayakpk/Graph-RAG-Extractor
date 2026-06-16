import type { DocumentStrategy } from "./chunk.js";

export interface TextLine {
  text: string;
  /** Left edge (PDF user-space x of the first glyph on the line). */
  x: number;
  /** Vertical position (PDF baseline y; larger = higher on the page). */
  y: number;
  /** Total width of the line in user-space units. */
  width: number;
  /** Approximate font size of the line (largest glyph) — drives heading detection. */
  fontSize: number;
}

export interface ParsedPage {
  pageNumber: number;
  /** Geometry-reconstructed lines, in reading order. */
  lines: TextLine[];
  /** Lines joined and page-normalized. */
  cleanedText: string;
}

export interface ParsedDocument {
  filename: string;
  pageCount: number;
  pages: ParsedPage[];
}

export interface DocumentProfile {
  filename: string;
  pageCount: number;
  avgCharsPerPage: number;
  ligatureCorruptionRate: number;
  columnNoiseDetected: boolean;
  lvPositionCount: number;
  vorbemerkungenPagesEstimate: number;
  repeatedHeaderLines: string[];
  suggestedStrategy: DocumentStrategy;
  parserConfidence: "high" | "medium" | "low";
}
