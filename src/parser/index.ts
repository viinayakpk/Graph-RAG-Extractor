import type { Logger } from "pino";
import type { DocumentProfile, ParsedDocument } from "../types/document.js";

export async function parse(
  filePath: string,
  documentProfile: DocumentProfile,
  log: Logger,
): Promise<ParsedDocument> {
  log.info({ filePath }, "parsing PDF");
  // TODO: implement — pdfjs-dist page extraction + normalize()
  throw new Error("parser not implemented");
}
