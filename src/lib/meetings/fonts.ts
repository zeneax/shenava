import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DocumentFonts } from "./docx.ts";

/**
 * The document face, read from disk once per process.
 *
 * `fonts/Vazirmatn-Regular.ttf` is the face the pages already use, shipped
 * under the SIL Open Font License in `fonts/OFL.txt` beside it. It is read
 * relative to the working directory, which is the pattern Next traces for
 * deployment; `import.meta.url` is not, because a bundler may move this
 * module and leave the font behind.
 *
 * Not `server-only`: the test that builds a real .docx and reads its font
 * table back needs to call this from plain node.
 */
let cached: DocumentFonts | null = null;

export function documentFonts(): DocumentFonts {
  if (!cached) {
    cached = { regular: readFileSync(join(process.cwd(), "src/lib/meetings/fonts/Vazirmatn-Regular.ttf")) };
  }
  return cached;
}
