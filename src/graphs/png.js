import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { THEME } from './theme.js';

const FONT_DIR = fileURLToPath(new URL('../../public/fonts', import.meta.url));

export function fontFiles(dir = FONT_DIR) {
  return existsSync(dir) ? readdirSync(dir).filter((f) => /\.(ttf|otf)$/i.test(f)).sort().map((f) => join(dir, f)) : [];
}

const FONTS = fontFiles();

export function pngOf(svg, files = FONTS) {
  return new Resvg(svg, { background: THEME.panel, font: { loadSystemFonts: false, fontFiles: files, defaultFontFamily: 'Space Mono' } }).render().asPng();
}
