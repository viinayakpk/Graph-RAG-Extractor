import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";

// pdfjs needs a worker even server-side. The *legacy* build is the one that runs
// cleanly under Node, and it executes the worker on the main thread when workerSrc
// points at the legacy worker file as a file:// URL. The non-legacy build with an
// empty workerSrc (the previous setup) fails with "Setting up fake worker failed"
// in Node — which is why the pipeline could not parse a PDF at all.
const require = createRequire(import.meta.url);
GlobalWorkerOptions.workerSrc = pathToFileURL(
  require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs"),
).href;

export { getDocument };
