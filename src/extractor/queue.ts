import pLimit from "p-limit";

const DEFAULT_CONCURRENCY = 3;

export function createQueue() {
  const limit = parseInt(process.env["CONCURRENCY_LIMIT"] ?? "", 10);
  const concurrency = Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_CONCURRENCY;
  return pLimit(concurrency);
}
