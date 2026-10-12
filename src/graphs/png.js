import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const FONT_DIR = fileURLToPath(new URL('../../assets/fonts', import.meta.url));

// resvg reads TrueType or OpenType files (not woff2). Offline fonts live in assets/fonts
// (Liberation Sans, SIL OFL); Plan 7 Task 11 swaps in the design fonts.
// System fonts are not loaded: slow and different on every machine.
export function fontFiles(dir = FONT_DIR) {
  return existsSync(dir) ? readdirSync(dir).filter((f) => /\.(ttf|otf)$/i.test(f)).sort().map((f) => join(dir, f)) : [];
}

const FONTS = fontFiles();

export function pngOf(svg, files = FONTS) {
  return new Resvg(svg, { background: '#101E33', font: { loadSystemFonts: false, fontFiles: files, defaultFontFamily: 'Liberation Sans' } }).render().asPng();
}
