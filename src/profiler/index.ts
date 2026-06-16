import { readFile } from "fs/promises";
import { basename } from "path";
import type { Logger } from "pino";
import { getDocument } from "../parser/pdfjs.js";
import type { DocumentProfile } from "../types/document.js";
import { normalizePage } from "../parser/normalize.js";
import {
  countOzPositions,
  countVorbemerkungen,
  hasColumnNoise,
  detectStrategy,
  detectRepeatedHeaders,
} from "./detect.js";
import { profilerConfig } from "../config.js";

// Unicode ligature characters — raw presence in PDF text measures normalization burden
const LIGATURE_RE = /[ﬀﬁﬂﬃﬄﬅﬆ]/g;

// pdfjs TextItem has 'str' + 'hasEOL'; TextMarkedContent has 'type'. Distinguish by 'str'.
interface PdfjsTextItem {
  str: string;
  hasEOL: boolean;
}

function isTextItem(item: object): item is PdfjsTextItem {
  return "str" in item;
}

function extractPageText(items: object[]): string {
  let text = "";
  for (const item of items) {
    if (!isTextItem(item)) continue;
    text += item.str;
    text += item.hasEOL ? "\n" : " ";
  }
  return text.trimEnd();
}

// Sample count scales with document length, bounded so large tenders stay fast.
function sampleSizeFor(pageCount: number): number {
  return Math.min(
    profilerConfig.sampleSizeMax,
    Math.max(
      profilerConfig.sampleSizeMin,
      Math.floor(pageCount * profilerConfig.sampleSizeFraction),
    ),
  );
}

function samplePageNumbers(pageCount: number): number[] {
  const sampleSize = sampleSizeFor(pageCount);
  if (pageCount <= sampleSize) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const first = [1, 2, 3, 4, 5];
  const last = [pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount];
  const middleCount = sampleSize - 10;
  const step = Math.floor((pageCount - 10) / middleCount);
  const middle = Array.from({ length: middleCount }, (_, i) => 6 + i * step);
  return [...first, ...middle, ...last];
}

export async function profile(filePath: string, log: Logger): Promise<DocumentProfile> {
  const source_file = basename(filePath);
  log.info({ source_file }, "profiler: opening PDF");

  const data = await readFile(filePath);
  const doc = await getDocument({ data: new Uint8Array(data), verbosity: 0 }).promise;
  const pageCount = doc.numPages;
  log.info({ source_file, pageCount }, "profiler: PDF loaded, sampling pages");

  const pageNumbers = samplePageNumbers(pageCount);
  const rawPageTexts: string[] = [];
  let totalRawChars = 0;
  let totalLigatureChars = 0;

  for (const pageNum of pageNumbers) {
    const page = await doc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const raw = extractPageText(textContent.items as object[]);

    totalRawChars += raw.length;
    totalLigatureChars += (raw.match(LIGATURE_RE) ?? []).length;
    rawPageTexts.push(raw);
  }

  const repeatedHeaderLines = detectRepeatedHeaders(rawPageTexts);
  const fullSampleText = rawPageTexts.join("\n");
  const cleanedTexts = rawPageTexts.map((t) => normalizePage(t, repeatedHeaderLines));
  const avgCharsPerPage = cleanedTexts.reduce((s, t) => s + t.length, 0) / pageNumbers.length;

  const lvPositionCount = countOzPositions(fullSampleText);
  const vorbemerkungenPagesEstimate = countVorbemerkungen(fullSampleText);
  const columnNoiseDetected = hasColumnNoise(fullSampleText);
  const ligatureCorruptionRate = totalRawChars > 0 ? totalLigatureChars / totalRawChars : 0;
  const suggestedStrategy = detectStrategy(lvPositionCount, vorbemerkungenPagesEstimate);

  const parserConfidence: "high" | "medium" | "low" =
    ligatureCorruptionRate > profilerConfig.ligatureCorruptionLowConfidence ? "low"
    : columnNoiseDetected ? "medium"
    : "high";

  const result: DocumentProfile = {
    filename: source_file,
    pageCount,
    avgCharsPerPage,
    ligatureCorruptionRate,
    columnNoiseDetected,
    lvPositionCount,
    vorbemerkungenPagesEstimate,
    repeatedHeaderLines,
    suggestedStrategy,
    parserConfidence,
  };

  log.info(
    {
      source_file,
      pageCount,
      suggestedStrategy,
      parserConfidence,
      lvPositionCount,
      vorbemerkungenPagesEstimate,
      columnNoiseDetected,
      ligatureCorruptionRate: ligatureCorruptionRate.toFixed(5),
      repeatedHeaders: repeatedHeaderLines.length,
      sampledPages: pageNumbers.length,
    },
    "profiler: complete",
  );

  return result;
}
