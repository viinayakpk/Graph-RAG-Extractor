import type { DocumentStrategy } from "./chunk.js";

export interface TextItem {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
}

export interface ParsedPage {
  pageNumber: number;
  rawText: string;
  cleanedText: string;
  textItems: TextItem[];
  detectedPositions: Array<{ ozNumber: string; lineStart: number; lineEnd: number }>;
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
