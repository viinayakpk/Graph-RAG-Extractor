import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";

// pdfjs needs a worker even in Node: the legacy build runs it on the main thread
// when workerSrc points at the legacy worker file as a file:// URL.
const require = createRequire(import.meta.url);
GlobalWorkerOptions.workerSrc = pathToFileURL(
  require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs"),
).href;

export { getDocument };
