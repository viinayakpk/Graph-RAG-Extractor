// Concurrency limiter for parallel LLM calls.
import pLimit from "p-limit";
import { extractionConfig } from "../config.js";

export function createQueue() {
  return pLimit(extractionConfig.concurrency);
}
