// The join sign: a public, read-only page built only from server settings (never from user input).
import { qrSvg } from './qr.js';

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
@page{size:A4;margin:12mm}
*{box-sizing:border-box}
html,body{margin:0;background:#fff;color:#000}
body{font:22px/1.35 system-ui,sans-serif;padding:16px 24px}
h1{font-size:44px;line-height:1.1;margin:0 0 10px}
.steps{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.step{border:4px solid #000;padding:12px 16px;display:flex;gap:16px;align-items:center;justify-content:space-between;break-inside:avoid}
.step h2{font-size:26px;margin:0 0 4px}
.big{display:block;font-size:44px;font-weight:700;line-height:1.1;overflow-wrap:anywhere;margin:4px 0 8px}
.qr{width:200px;flex:none}.qr svg{display:block;width:100%;height:auto}
.last{font-size:26px;margin:14px 0 0;font-weight:700}
@media (max-width:900px){body{padding:12px 12px;font-size:18px}h1{font-size:32px}.steps{grid-template-columns:1fr;gap:10px}.step{padding:8px 12px;flex-direction:row}.step h2{font-size:20px}.big{font-size:28px;margin:2px 0 4px}.qr{width:96px}.last{font-size:18px;margin-top:8px}}
@media print{body{padding:0;font-size:24px}h1{font-size:54px}.big{font-size:52px}.qr{width:260px}}
@media print and (orientation:portrait){.steps{grid-template-columns:1fr}}
</style></head><body>
<h1>Join Startup Showdown</h1>
<div class="steps">
<section class="step"><div><h2>1. Connect to the Wi-Fi</h2>Network<span class="big">${esc(ssid)}</span>Password<span class="big">${hasPassword ? esc(password) : ASK}</span></div>${wifiQr ? `<div class="qr">${wifiQr}</div>` : ''}</section>
<section class="step"><div><h2>2. Open your browser</h2>Type this address<span class="big">${esc(shown)}</span>If your phone says there is no internet, stay on this Wi-Fi.</div><div class="qr">${urlQr}</div></section>
</div>
<p class="last">3. Type your Admission ID and wait for the organizer.</p>
</body></html>`;
}
