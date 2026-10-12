// Offline sign maker: node scripts/make-sign.js --password <wifi password> [--ssid Showdown] [--address 10.42.0.1] [--out sign.html]
// The same page is served at /join. This file is for a printout that needs no running server.
import { writeFileSync } from 'node:fs';
import { signPage, escapeWifi } from '../src/sign.js';

export { escapeWifi };
export async function signHtml({ ssid, password, address }) {
  return signPage({ ssid, password, joinUrl: `http://${address}` });
}

if (process.argv[1] && process.argv[1].endsWith('make-sign.js')) {
  const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };
  const password = arg('password');
  if (!password) { console.error('Usage: node scripts/make-sign.js --password <wifi password> [--ssid Showdown] [--address 10.42.0.1] [--out sign.html]'); process.exit(1); }
  const out = arg('out', 'sign.html');
  writeFileSync(out, await signHtml({ ssid: arg('ssid', 'Showdown'), password, address: arg('address', '10.42.0.1') }));
  console.log(`Wrote ${out}. Open it and print it. Do not commit it (it contains the Wi-Fi password).`);
}
