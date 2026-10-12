// The join sign: a public, read-only page built only from server settings (never from user input).
import { readFileSync } from 'node:fs';
import { qrSvg } from './qr.js';

// The sign uses the game's colour tokens and offline fonts (public/css/tokens.css, public/fonts), inlined so the page stands alone.
const TOKENS = readFileSync(new URL('../public/css/tokens.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

export const DEFAULT_JOIN_URL = 'http://10.42.0.1';
export const DEFAULT_SSID = 'Showdown';
const BS = String.fromCharCode(92);
const WIFI_SPECIAL = new Set([BS, ';', ',', ':', '"']);
export const escapeWifi = (s) => [...String(s)].map((c) => (WIFI_SPECIAL.has(c) ? BS + c : c)).join('');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Read the three settings from an environment object. A JOIN_URL that is not a plain http(s) address is ignored.
export function joinConfigFromEnv(env = process.env) {
  const url = String(env.JOIN_URL ?? '').trim();
  const ok = /^https?:\/\/[A-Za-z0-9.-]+(:[0-9]{1,5})?(\/[A-Za-z0-9._~\/-]*)?$/.test(url) && url.length <= 100;
  return {
    ssid: String(env.WIFI_SSID ?? '').trim().slice(0, 32) || DEFAULT_SSID,
    password: String(env.WIFI_PASSWORD ?? '').slice(0, 63),
    joinUrl: ok ? url : DEFAULT_JOIN_URL,
  };
}

const ASK = 'ask the organizer';

export function signPage({ ssid = DEFAULT_SSID, password = '', joinUrl = DEFAULT_JOIN_URL } = {}) {
  const hasPassword = String(password) !== '';
  const target = /\/$/.test(joinUrl) ? joinUrl : `${joinUrl}/`;
  const wifiQr = hasPassword ? qrSvg(`WIFI:T:WPA;S:${escapeWifi(ssid)};P:${escapeWifi(password)};;`, { label: 'Wi-Fi QR code' }) : '';
  const urlQr = qrSvg(target, { label: 'Game address QR code' });
  const shown = String(joinUrl).replace(/^https?:\/\//, '');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Startup Showdown: how to join</title>
<style>
${TOKENS}
@font-face{font-family:"Alfa Slab One";src:url("/fonts/alfa-slab-one-latin-400-normal.woff2") format("woff2");font-display:swap}
@font-face{font-family:"Archivo Black";src:url("/fonts/archivo-black-latin-400-normal.woff2") format("woff2");font-display:swap}
@font-face{font-family:"Space Mono";font-weight:400;src:url("/fonts/space-mono-latin-400-normal.woff2") format("woff2");font-display:swap}
@font-face{font-family:"Space Mono";font-weight:700;src:url("/fonts/space-mono-latin-700-normal.woff2") format("woff2");font-display:swap}
@page{size:A4;margin:12mm}
*{box-sizing:border-box}
html,body{margin:0;background:var(--paper);color:var(--ink)}
body{font:400 22px/1.35 var(--mono);padding:16px 24px;max-width:1280px;margin:0 auto}
h1{font:400 44px/1.05 var(--slab);text-transform:uppercase;margin:0 0 18px;border:var(--line-thick) solid var(--ink);background:var(--paper);padding:10px 18px;box-shadow:8px 8px 0 var(--ink)}
h1 b{font-weight:400;color:var(--orange);-webkit-text-stroke:2px var(--ink);paint-order:stroke fill}
.steps{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.step{border:var(--line-thick) solid var(--ink);background:var(--field);box-shadow:var(--shadow) var(--shadow) 0 var(--ink);padding:0 16px 14px;display:flex;gap:16px;align-items:center;justify-content:space-between;break-inside:avoid}
.step h2{display:inline-block;font:400 24px/1.1 var(--block);text-transform:uppercase;margin:0 0 10px -16px;background:var(--ink);color:var(--paper);padding:10px 34px 10px 16px;clip-path:polygon(0 0,100% 0,calc(100% - 22px) 100%,0 100%)}
.big{display:block;font:400 44px/1.1 var(--block);overflow-wrap:anywhere;margin:4px 0 8px}
.qr{width:200px;flex:none;border:var(--line) solid var(--ink);background:var(--white);padding:6px}.qr svg{display:block;width:100%;height:auto}
.last{font:400 26px/1.25 var(--block);margin:24px 0 0;border:var(--line-thick) solid var(--ink);background:var(--orange);color:var(--ink);padding:12px 18px;box-shadow:var(--shadow) var(--shadow) 0 var(--ink)}
@media (max-width:900px){body{padding:12px 12px;font-size:18px}h1{font-size:32px;box-shadow:5px 5px 0 var(--ink)}.steps{grid-template-columns:1fr;gap:14px}.step{padding:0 12px 10px;flex-direction:row}.step h2{font-size:18px;margin-left:-12px}.big{font-size:28px;margin:2px 0 4px}.qr{width:104px}.last{font-size:18px;margin-top:14px}}
@media print{html,body{background:var(--white)}body{padding:0;font-size:24px}h1{font-size:54px;box-shadow:none}.step,.last{box-shadow:none;background:var(--white)}.big{font-size:52px}.qr{width:260px}}
@media print and (orientation:portrait){.steps{grid-template-columns:1fr}}
</style></head><body>
<h1>Join Startup <b>Showdown</b></h1>
<div class="steps">
<section class="step"><div><h2>1. Connect to the Wi-Fi</h2>Network<span class="big">${esc(ssid)}</span>Password<span class="big">${hasPassword ? esc(password) : ASK}</span></div>${wifiQr ? `<div class="qr">${wifiQr}</div>` : ''}</section>
<section class="step"><div><h2>2. Open your browser</h2>Type this address<span class="big">${esc(shown)}</span>If your phone says there is no internet, stay on this Wi-Fi.</div><div class="qr">${urlQr}</div></section>
</div>
<p class="last">3. Type your Admission ID and wait for the organizer.</p>
</body></html>`;
}
