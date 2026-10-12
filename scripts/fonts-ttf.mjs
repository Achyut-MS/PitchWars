// Makes TrueType copies of the game fonts for the PNG graphs (@resvg/resvg-js cannot read woff2).
// Run once after changing the fonts: npm run fonts:ttf   (dev only; the .ttf files are committed)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { decompress } from 'wawoff2';

for (const f of readdirSync('public/fonts').filter((n) => n.endsWith('.woff2'))) {
  const ttf = Buffer.from(await decompress(readFileSync(`public/fonts/${f}`)));
  writeFileSync(`public/fonts/${f.replace(/\.woff2$/, '.ttf')}`, ttf);
  console.log(`${f} -> ${ttf.length} bytes`);
}
