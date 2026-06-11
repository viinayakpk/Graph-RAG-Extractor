import { extractionConfig } from "../config.js";

const ENTFALLT_RE = /Entf[äa]llt/i;

export function isEntfallt(content: string): boolean {
  return ENTFALLT_RE.test(content);
}

export function estimateTokens(content: string): number {
  return Math.ceil(content.length / extractionConfig.charsPerToken);
}

export function exceedsTokenLimit(content: string): boolean {
  return estimateTokens(content) > extractionConfig.maxChunkTokens;
}
