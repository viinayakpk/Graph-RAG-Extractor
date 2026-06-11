import { readFile } from "fs/promises";
import { basename } from "path";
import type { Logger } from "pino";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import type { DocumentProfile } from "../types/document.js";
import { normalizePage } from "../parser/normalize.js";
import {
  countOzPositions,
  countVorbemerkungen,
  hasColumnNoise,
  detectStrategy,
  detectRepeatedHeaders,
  pageHasPreambleOz,
} from "./detect.js";
import { profilerConfig } from "../config.js";

// Node.js has no browser worker context. Empty string puts pdfjs into fake-worker mode
// (synchronous, main-thread execution), which is correct for server-side text extraction.
GlobalWorkerOptions.workerSrc = "";

// Unicode ligature characters — raw presence in PDF text measures normalization burden
const LIGATURE_RE = /[ﬀﬁﬂﬃﬄﬅﬆ]/g;

const SAMPLE_SIZE = profilerConfig.sampleSize;

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

function samplePageNumbers(pageCount: number): number[] {
  if (pageCount <= SAMPLE_SIZE) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const first = [1, 2, 3, 4, 5];
  const last = [pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount];
  const middleCount = SAMPLE_SIZE - 10;
  const step = Math.floor((pageCount - 10) / middleCount);
  const middle = Array.from({ length: middleCount }, (_, i) => 6 + i * step);
  return [...first, ...middle, ...last];
}

// For "mixed" documents: find the last sampled page that contains a vorbemerkungen OZ code,
// then return (nextSample - 1) as the boundary so pages between the last preamble sample
// and the next sample are included in the preamble pass, not the position pass.
// Scanning all samples (not stopping at the first gap) handles continuation pages within
// a vorbemerkungen block — those pages have no OZ code at the top but are still preamble.
function detectPreambleBoundary(
  pageNumbers: number[],
  rawPageTexts: string[],
): number | null {
  let lastPreambleSampled: number | null = null;

  for (let i = 0; i < pageNumbers.length; i++) {
    if (pageHasPreambleOz(rawPageTexts[i]!)) {
      lastPreambleSampled = pageNumbers[i]!;
    }
  }

  if (lastPreambleSampled === null) return null;

  const nextSampled = pageNumbers.find((p) => p > lastPreambleSampled!);
  return nextSampled !== undefined ? nextSampled - 1 : lastPreambleSampled;
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

  const preambleBoundaryPage =
    suggestedStrategy === "mixed"
      ? detectPreambleBoundary(pageNumbers, rawPageTexts)
      : null;

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
    preambleBoundaryPage,
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
      preambleBoundaryPage,
    },
    "profiler: complete"
  );

  return result;
}
