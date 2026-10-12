// Run ONCE, before any markup change in this plan: node scripts/record-hooks.mjs > test/fixtures/hooks.json
import { hooksOf } from './hooks.js';
import { renderAll } from '../test/fixtures/render-all.js';

const out = {};
for (const [name, html] of Object.entries(renderAll())) out[name] = hooksOf(html);
process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
