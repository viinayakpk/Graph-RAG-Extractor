---
name: backend-typescript-node
description: Review or scaffold TypeScript/Node.js code for the Graph-RAG-Extractor pipeline — Node CLI, Zod schemas, async/await, pino logging, and local file outputs. Use when writing any new module or reviewing existing pipeline code for TypeScript correctness and BOND brief compliance.
---

# Backend TypeScript / Node Review

Review or write TypeScript/Node.js code for the Graph-RAG-Extractor pipeline. Every piece of code in this project must comply with the BOND brief conventions and the project's hard constraints.

## Hard Rules (reject code that violates these)

| Rule | Correct | Wrong |
|---|---|---|
| Async style | `await fn()` | `.then(r => ...)` / `.catch(e => ...)` |
| Error handling | `try { await fn() } catch (e) { log.error(e) }` | unhandled promise, silent swallow |
| Secrets | `process.env.DEEPSEEK_API_KEY` | hardcoded string |
| Model name | `process.env.DEEPSEEK_MODEL ?? "deepseek-chat"` | `"deepseek-chat"` literal |
| Schema validation | `ChunkSchema.parse(data)` — throws on bad data | skipping Zod, using `as Type` cast |
| Logging | `log.info({ chunk_id }, "message")` | `console.log(...)` |
| Types | no `any` — use `unknown` then narrow | `(data as any).field` |
| Exports | named exports | default exports in library modules |

## Project Module Map

```
src/
  cli.ts              ← entry point: parse args, call pipeline, write output
  parser/
    index.ts          ← parsePdf(filePath, log): Promise<ParsedPage[]>
  chunker/
    index.ts          ← chunkPages(pages, log): Promise<Chunk[]>
  extractor/
    index.ts          ← extractFromChunk(chunk, client, log): Promise<ChunkExtraction[]>
    prompts.ts        ← EXTRACTION_SYSTEM_PROMPT_V1: string
  consolidator/
    index.ts          ← consolidate(candidates, log): Promise<ConsolidatedRequirement[]>
  tree-builder/
    index.ts          ← buildTree(requirements, log): Promise<ProcurementMatchDeliverable[]>
  types/
    chunk.ts          ← Chunk interface
    procurement.ts    ← ProcurementMatchDeliverable + LocaleObject
  schemas/
    chunk.ts          ← ChunkSchema (Zod)
    extraction.ts     ← ChunkExtractionSchema (Zod)
    procurement.ts    ← ProcurementMatchDeliverableSchema (Zod, recursive)
outputs/              ← one JSON file per run; gitignored
```

## Logger Pattern (pino)

```typescript
// src/cli.ts — create once, pass as argument
import pino from "pino";
const log = pino({ level: process.env.LOG_LEVEL ?? "info" });

// Every function signature takes log as last arg
async function extractFromChunk(
  chunk: Chunk,
  client: DeepSeekClient,
  log: pino.Logger
): Promise<ChunkExtraction[]> {
  log.info({ chunk_id: chunk.chunk_id, source_file: chunk.source_file }, "extracting");
  // ...
}
```

No global logger. No `console.log`. Every log call includes `chunk_id` or `source_file` as structured context.

## Zod Schema Patterns

```typescript
// Recursive schema for the tree (Zod v3)
import { z } from "zod";

type ProcurementMatchDeliverable = {
  bulletPoint: string;
  deliverableArray: ProcurementMatchDeliverable[];
  procurementDocumentChunkIdArray: string[];
  // ... other fields
};

const ProcurementMatchDeliverableSchema: z.ZodType<ProcurementMatchDeliverable> = z.lazy(() =>
  z.object({
    bulletPoint: z.string(),
    priority: z.enum(["must", "should", "optional"]),
    confidence: z.enum(["high", "medium", "low"]).nullable(),
    equivalenceAllowed: z.boolean().nullable(),
    fullfillable: z.enum(["yes", "no", "maybe"]).nullable(),
    description: z.record(z.string()),           // LocaleObject<string>
    deliverableArray: z.array(ProcurementMatchDeliverableSchema),
    procurementDocumentChunkIdArray: z.array(z.string()),
    // Assessment-fixed fields:
    status: z.literal("waitingForAnalysis"),
    aiReasoning: z.null(),
    feedback: z.null(),
    feedbackText: z.null(),
    openQuestionId: z.null(),
    workspaceDocumentChunkIdArray: z.array(z.string()),
    citedProductIdArray: z.array(z.string()),
    citedPersonIdArray: z.array(z.string()),
  })
);
```

## CLI Entry Point Pattern

```typescript
// src/cli.ts
import { parseArgs } from "node:util";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import pino from "pino";

async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: "string", multiple: true, short: "i" },
      output: { type: "string", short: "o", default: "outputs" },
    },
  });

  const log = pino({ level: process.env.LOG_LEVEL ?? "info" });

  if (!values.input?.length) {
    log.error("--input <pdf-path> is required");
    process.exit(1);
  }

  for (const inputPath of values.input) {
    log.info({ inputPath }, "starting pipeline");
    // call pipeline stages...
    const tree = await runPipeline(inputPath, log);
    const outPath = resolve(values.output!, `${basename(inputPath, ".pdf")}.json`);
    await writeFile(outPath, JSON.stringify(tree, null, 2), "utf-8");
    log.info({ outPath }, "output written");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

## DeepSeek API Call Pattern

```typescript
import OpenAI from "openai";  // DeepSeek is OpenAI-compatible

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
});

const response = await client.chat.completions.create({
  model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
  temperature: 0,
  messages: [
    { role: "system", content: EXTRACTION_SYSTEM_PROMPT_V1 },
    { role: "user", content: chunk.content },
  ],
  response_format: { type: "json_object" },
});

log.debug({
  chunk_id: chunk.chunk_id,
  prompt_tokens: response.usage?.prompt_tokens,
  completion_tokens: response.usage?.completion_tokens,
}, "deepseek usage");

const raw = response.choices[0]?.message?.content ?? "";
```

## package.json Essentials

```json
{
  "type": "module",
  "scripts": {
    "dev": "tsx src/cli.ts",
    "build": "tsc",
    "start": "node dist/cli.js"
  },
  "dependencies": {
    "openai": "^4.x",
    "zod": "^3.x",
    "pino": "^9.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "tsx": "^4.x",
    "@types/node": "^20.x"
  }
}
```

## tsconfig.json Essentials

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

## Code Review Checklist

When reviewing any file in `src/`:
- [ ] No `.then()` / `.catch()` anywhere
- [ ] No `console.log` — pino only
- [ ] No `any` type
- [ ] No hardcoded model name or API key
- [ ] Every async function has a `try/catch` or lets the error bubble intentionally
- [ ] Every function that processes a chunk logs `chunk_id` and `source_file`
- [ ] Zod `.parse()` called before any LLM output enters the next stage
- [ ] Output JSON written with `JSON.stringify(tree, null, 2)` — human-readable
