import type { TextLine } from "../types/document.js";
import { geometryConfig } from "../config.js";

// pdfjs `getTextContent` items carry the geometry we need: a transform matrix
// [a, b, c, d, e, f] where (e, f) is the glyph origin and d is the vertical scale
// (≈ font size for unrotated text), plus the glyph width and height.
interface PdfTextItem {
  str: string;
  width: number;
  height: number;
  transform: number[];
}

interface Glyph {
  str: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
}

const LINE_Y_TOLERANCE = geometryConfig.lineYToleranceRatio;
const WORD_GAP_RATIO = geometryConfig.wordGapRatio;

function isTextItem(item: object): item is PdfTextItem {
  return "str" in item && "transform" in item;
}

function toGlyph(item: PdfTextItem): Glyph {
  const t = item.transform;
  const fontSize = Math.abs(t[3] ?? 0) || item.height || 0;
  return { str: item.str, x: t[4] ?? 0, y: t[5] ?? 0, width: item.width, fontSize };
}

// Rebuild ordered text lines from pdfjs glyphs using their on-page geometry, so
// reading order, line breaks, and per-line font size come from the page layout
// itself rather than from the extractor's flattened character stream. This is
// the signal the regex-based chunker was throwing away.
export function reconstructLines(items: object[]): TextLine[] {
  const glyphs: Glyph[] = [];
  for (const item of items) {
    if (!isTextItem(item) || item.str.length === 0) continue;
    glyphs.push(toGlyph(item));
  }
  if (glyphs.length === 0) return [];

  const sizes = glyphs.map((g) => g.fontSize).filter((s) => s > 0).sort((a, b) => a - b);
  const medianSize = sizes[Math.floor(sizes.length / 2)] ?? 10;
  const yTolerance = medianSize * LINE_Y_TOLERANCE;

  // Top-to-bottom (pdfjs y grows upward), then left-to-right.
  glyphs.sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: TextLine[] = [];
  let band: Glyph[] = [];
  let bandY = glyphs[0]!.y;
  for (const glyph of glyphs) {
    if (band.length > 0 && Math.abs(glyph.y - bandY) > yTolerance) {
      lines.push(buildLine(band));
      band = [];
    }
    if (band.length === 0) bandY = glyph.y;
    band.push(glyph);
  }
  if (band.length > 0) lines.push(buildLine(band));
  return lines;
}

function buildLine(glyphs: Glyph[]): TextLine {
  glyphs.sort((a, b) => a.x - b.x);
  let text = "";
  let prevRight = -Infinity;
  for (const g of glyphs) {
    if (text.length > 0 && g.x - prevRight > g.fontSize * WORD_GAP_RATIO) text += " ";
    text += g.str;
    prevRight = g.x + g.width;
  }
  const first = glyphs[0]!;
  const last = glyphs[glyphs.length - 1]!;
  return {
    text: text.replace(/\s+/g, " ").trim(),
    x: first.x,
    y: Math.max(...glyphs.map((g) => g.y)),
    width: last.x + last.width - first.x,
    fontSize: Math.max(...glyphs.map((g) => g.fontSize)),
  };
}
