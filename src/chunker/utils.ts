// Filename to a stable slug used to namespace chunk IDs.
import { basename } from "path";

export function slugify(filename: string): string {
  return basename(filename, ".pdf").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
