import { readFile } from "fs/promises";
import { basename } from "path";
import type { Logger } from "pino";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import type { DocumentProfile, ParsedDocument, ParsedPage } from "../types/document.js";
import { normalizePage } from "./normalize.js";

// Idempotent — profiler/index.ts sets the same value at module load
GlobalWorkerOptions.workerSrc = "";

// Matches the three OZ position formats we care about (exact full-line match)
// Fahrradgaragen:  01.01.0010
// Salzburg rooms:  GU.07.01.01.01
// Salzburg vorb:   00.00.00.09.01
const OZ_LINE_RE = /^(?:\d{2}\.\d{2}\.\d{4}|[A-Z]{2}\.\d{2}\.\d{2}\.\d{2}\.\d{2}|00\.00\.00\.\d{2}\.\d{2})$/;

interface PdfjsTextItem {
  str: string;
  transform: number[]; // 6-element matrix: [a, b, c, d, x, y]
  width: number;
  height: number;
  hasEOL: boolean;
}

function isTextItem(item: object): item is PdfjsTextItem {
  return "str" in item;
}

export async function parse(
  filePath: string,
  documentProfile: DocumentProfile,
  log: Logger,
): Promise<ParsedDocument> {
  const source_file = basename(filePath);
  log.info({ source_file, pageCount: documentProfile.pageCount }, "parser: opening PDF");

  const data = await readFile(filePath);
  const doc = await getDocument({ data: new Uint8Array(data), verbosity: 0 }).promise;

  const pages: ParsedPage[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const textContent = await page.getTextContent();

    let rawText = "";

    for (const item of textContent.items as object[]) {
      if (!isTextItem(item)) continue;
      rawText += item.str;
      rawText += item.hasEOL ? "\n" : " ";
    }
    rawText = rawText.trimEnd();

    const cleanedText = normalizePage(rawText, documentProfile.repeatedHeaderLines);

    const lines = cleanedText.split("\n");
    const detectedPositions: ParsedPage["detectedPositions"] = [];

    for (let i = 0; i < lines.length; i++) {
      const trimmed = (lines[i] ?? "").trim();
      if (!OZ_LINE_RE.test(trimmed)) continue;

      // Extend the block to just before the next OZ line
      let lineEnd = i;
      for (let j = i + 1; j < lines.length; j++) {
        if (OZ_LINE_RE.test((lines[j] ?? "").trim())) break;
        lineEnd = j;
      }
      detectedPositions.push({ ozNumber: trimmed, lineStart: i, lineEnd });
    }

    pages.push({ pageNumber: pageNum, rawText, cleanedText, detectedPositions });

    if (pageNum % 50 === 0) {
      log.info(
        { source_file, pageNum, totalPages: doc.numPages },
        "parser: progress"
      );
    }
  }

  log.info({ source_file, pageCount: pages.length }, "parser: complete");
  return { filename: source_file, pageCount: pages.length, pages };
}
