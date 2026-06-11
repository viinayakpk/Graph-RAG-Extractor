import type { DocumentStrategy } from "./chunk.js";

export interface ParsedPage {
  pageNumber: number;
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
  // Last page containing a vorbemerkungen OZ code, derived from the profiler sample.
  // The "mixed" chunker uses this to split preamble from room-position pages.
  preambleBoundaryPage: number | null;
}
