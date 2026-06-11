import pLimit from "p-limit";
import { extractionConfig } from "../config.js";

export function createQueue() {
  return pLimit(extractionConfig.concurrency);
}
