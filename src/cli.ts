import { parseArgs } from "node:util";
import { mkdir, writeFile, readdir } from "node:fs/promises";
import { basename, resolve } from "node:path";
import pino from "pino";
import { runPipeline } from "./pipeline.js";

const log = pino({
  level: process.env["LOG_LEVEL"] ?? "info",
  transport: { target: "pino-pretty" },
});

async function writeArtifact(dir: string, name: string, data: unknown): Promise<void> {
  const path = resolve(dir, name);
  await writeFile(path, JSON.stringify(data, null, 2));
  log.info({ path }, "wrote artifact");
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      pdf: { type: "string", multiple: true, short: "p" },
      dir: { type: "string", short: "d" },
      output: { type: "string", short: "o", default: "outputs" },
      force: { type: "boolean", short: "f", default: false },
    },
  });

  // Each PDF is one tender. --pdf lists them explicitly; --dir takes every PDF in a
  // folder (what `docker compose up` uses to run all the mounted tenders).
  const pdfs = [...(values.pdf ?? [])];
  if (values.dir) {
    const entries = await readdir(values.dir);
    for (const name of entries.sort()) {
      if (name.toLowerCase().endsWith(".pdf")) pdfs.push(resolve(values.dir, name));
    }
  }

  if (pdfs.length === 0) {
    log.error("provide --pdf <path> (repeatable) or --dir <folder of PDFs>");
    process.exit(1);
  }

  for (const pdfPath of pdfs) {
    const tenderName = basename(pdfPath, ".pdf").toLowerCase().replace(/\s+/g, "-");
    const outDir = resolve(values.output!, tenderName);

    await mkdir(resolve(outDir, "cache"), { recursive: true });
    log.info({ pdfPath, tenderName, outDir }, "pipeline starting");

    const result = await runPipeline(pdfPath, outDir, { force: values.force ?? false }, log);

    await writeArtifact(outDir, "chunks.json", result.chunks);
    await writeArtifact(outDir, "extractions.json", result.extractions);
    await writeArtifact(outDir, "consolidated.json", result.consolidated);
    await writeArtifact(outDir, "tree.json", result.tree);

    log.info(
      {
        outDir,
        chunks: result.chunks.length,
        extractions: result.extractions.length,
        requirements: result.consolidated.length,
        leafCount: result.stats.leafCount,
      },
      "pipeline complete",
    );
  }
}

// Top-level await with try/catch — the brief mandates async/await, no .then()/.catch().
try {
  await main();
} catch (err) {
  log.error({ err }, "fatal: pipeline run failed");
  process.exit(1);
}
