import { readFile } from "fs/promises";
import { basename } from "path";
import type { Logger } from "pino";
import { getDocument } from "./pdfjs.js";
import type { DocumentProfile, ParsedDocument, ParsedPage } from "../types/document.js";
import { normalizePage } from "./normalize.js";

interface PdfjsTextItem {
  str: string;
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

  // LV pricing-table noise only exists in Leistungsverzeichnis tenders, not in
  // prose (section-list) documents like the English tender.
  const stripLvTableNoise = documentProfile.suggestedStrategy !== "section-list";
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

    const cleanedText = normalizePage(rawText.trimEnd(), documentProfile.repeatedHeaderLines, {
      stripLvTableNoise,
    });

    pages.push({ pageNumber: pageNum, cleanedText });

    if (pageNum % 50 === 0) {
      log.info({ source_file, pageNum, totalPages: doc.numPages }, "parser: progress");
    }
  }

  log.info({ source_file, pageCount: pages.length }, "parser: complete");
  return { filename: source_file, pageCount: pages.length, pages };
}
