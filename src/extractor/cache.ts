import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import type { ChunkExtraction } from "../types/requirement.js";

export async function readCache(
  cacheDir: string,
  chunkId: string
): Promise<ChunkExtraction[] | null> {
  try {
    const raw = await readFile(join(cacheDir, `${chunkId}.json`), "utf-8");
    return JSON.parse(raw) as ChunkExtraction[];
  } catch {
    return null;
  }
}

export async function writeCache(
  cacheDir: string,
  chunkId: string,
  extractions: ChunkExtraction[]
): Promise<void> {
  await writeFile(
    join(cacheDir, `${chunkId}.json`),
    JSON.stringify(extractions, null, 2),
    "utf-8"
  );
}
