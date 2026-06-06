import type { Logger } from "pino";
import type { DocumentProfile } from "../types/document.js";
import { detectStrategy, detectRepeatedHeaders } from "./detect.js";

export async function profile(filePath: string, log: Logger): Promise<DocumentProfile> {
  log.info({ filePath }, "profiling document");
  // TODO: implement — open PDF with pdfjs-dist, sample pages, compute heuristics
  throw new Error("profiler not implemented");
}
