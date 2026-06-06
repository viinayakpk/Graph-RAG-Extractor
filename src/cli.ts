import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import pino from "pino";
import { runPipeline } from "./pipeline.js";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      pdf: { type: "string", multiple: true, short: "p" },
      output: { type: "string", short: "o", default: "outputs" },
      force: { type: "boolean", short: "f", default: false },
    },
  });

  const log = pino({
    level: process.env["LOG_LEVEL"] ?? "info",
    transport: { target: "pino-pretty" },
  });

  if (!values.pdf?.length) {
    log.error("--pdf <path> is required (pass multiple --pdf flags for multiple files)");
    process.exit(1);
  }

  for (const pdfPath of values.pdf) {
    const tenderName = basename(pdfPath, ".pdf").toLowerCase().replace(/\s+/g, "-");
    const outDir = resolve(values.output!, tenderName);

    await mkdir(outDir, { recursive: true });
    await mkdir(resolve(outDir, "cache"), { recursive: true });

    log.info({ pdfPath, tenderName, outDir }, "pipeline starting");

    const result = await runPipeline(pdfPath, outDir, { force: values.force ?? false }, log);

    await writeFile(resolve(outDir, "chunks.json"), JSON.stringify(result.chunks, null, 2));
    await writeFile(resolve(outDir, "extractions.json"), JSON.stringify(result.extractions, null, 2));
    await writeFile(resolve(outDir, "consolidated.json"), JSON.stringify(result.consolidated, null, 2));
    await writeFile(resolve(outDir, "tree.json"), JSON.stringify(result.tree, null, 2));

    log.info({ outDir, leafCount: result.stats.leafCount }, "pipeline complete");
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
