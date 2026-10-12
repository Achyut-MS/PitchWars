import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { signHtml, escapeWifi } from '../scripts/make-sign.js';
import { signPage, joinConfigFromEnv } from '../src/sign.js';
import { createApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { loadData } from '../src/data.js';

const BS = String.fromCharCode(92);

test('special characters in the Wi-Fi string are escaped with a backslash', () => {
  assert.equal(escapeWifi(`a;b,c:d"e${BS}f`), `a${BS};b${BS},c${BS}:d${BS}"e${BS}${BS}f`);
  assert.equal(escapeWifi('plain'), 'plain');
});

test('the sign shows the network, password and address, and has two QR codes', async () => {
  const html = await signHtml({ ssid: 'Showdown', password: 'pass1234', address: '10.42.0.1' });
  assert.match(html, />Showdown</);
  assert.match(html, />pass1234</);
  assert.match(html, />10\.42\.0\.1</);
  assert.equal((html.match(/<svg/g) || []).length, 2);
  assert.match(html, /no internet/);
});

test('a hostile network name and password are escaped in the page', async () => {
  const html = await signHtml({ ssid: '<script>x</script>', password: 'p"q<img src=x onerror=1>', address: '10.42.0.1' });
  assert.equal(html.includes('<script>x</script>'), false);
  assert.equal(html.includes('<img'), false);
  assert.match(html, /&lt;script&gt;/);
});

test('env handling: defaults, trimming, and a bad JOIN_URL is ignored', () => {
  assert.deepEqual(joinConfigFromEnv({}), { ssid: 'Showdown', password: '', joinUrl: 'http://10.42.0.1' });
  assert.deepEqual(joinConfigFromEnv({ WIFI_SSID: ' Fair ', WIFI_PASSWORD: 'pw', JOIN_URL: 'http://192.168.4.1' }), { ssid: 'Fair', password: 'pw', joinUrl: 'http://192.168.4.1' });
  for (const bad of ['javascript:alert(1)', 'http://x"onload="y', 'ftp://a', '<b>', 'http://a/' + 'b'.repeat(200)]) assert.equal(joinConfigFromEnv({ JOIN_URL: bad }).joinUrl, 'http://10.42.0.1');
});

test('with no Wi-Fi password the sign says to ask the organizer and has no Wi-Fi QR', () => {
  const html = signPage({ ssid: 'Showdown', password: '', joinUrl: 'http://10.42.0.1' });
  assert.match(html, />ask the organizer</);
  assert.equal((html.match(/<svg/g) || []).length, 1);
});

test('the page is print and projector friendly, plain and offline', () => {
  const html = signPage({ ssid: 'S', password: 'p', joinUrl: 'http://10.42.0.1' });
  assert.match(html, /@page\{size:A4/);
  assert.match(html, /@media print/);
  assert.match(html, /max-width:900px/);
  assert.equal(/<script|<link|https?:\/\/(?!www\.w3\.org|10\.)/.test(html.replace(/>[^<]*</g, '><')), false);
});

function get(port, path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const r = http.request({ port, path, method }, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b })); });
    r.on('error', reject); r.end();
  });
}
async function withApp(join, fn) {
  const app = createApp({ db: openDb(':memory:'), organizerPassword: 'organizer-secret-pw', data: loadData('data'), join });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  try { await fn(app.server.address().port); } finally { await new Promise((r) => app.server.close(r)); }
}

test('/join is public, read-only, built from the config, and reveals nothing else', async () => {
  await withApp(() => ({ ssid: 'Sh<ow>', password: 'wifi-pw', joinUrl: 'http://10.42.0.1' }), async (port) => {
    const r = await get(port, '/join');
    assert.equal(r.status, 200);
    assert.match(r.headers['content-type'], /text\/html/);
    assert.match(r.headers['content-security-policy'], /default-src 'none'/);
    assert.match(r.body, />wifi-pw</);
    assert.match(r.body, /Sh&lt;ow&gt;/);
    assert.equal(r.body.includes('organizer-secret-pw'), false);
    assert.equal((await get(port, '/join?ssid=evil&password=evil')).body.includes('evil'), false);
    assert.equal((await get(port, '/join', 'HEAD')).status, 200);
    assert.equal((await get(port, '/join', 'POST')).status, 405);
    assert.equal((await get(port, '/join/')).status, 200);
  });
});

test('/join reads the environment by default and shows "ask the organizer" without WIFI_PASSWORD', async () => {
  const saved = { p: process.env.WIFI_PASSWORD, s: process.env.WIFI_SSID };
  delete process.env.WIFI_PASSWORD; delete process.env.WIFI_SSID;
  try {
    await withApp(undefined, async (port) => {
      const r = await get(port, '/join');
      assert.match(r.body, />ask the organizer</);
      assert.match(r.body, />Showdown</);
    });
  } finally { if (saved.p !== undefined) process.env.WIFI_PASSWORD = saved.p; if (saved.s !== undefined) process.env.WIFI_SSID = saved.s; }
});

test('the organizer lobby links to the join sign', async () => {
  const { renderOrganizer } = await import('../public/render-organizer.js');
  const html = renderOrganizer({ participants: [], problems: [] });
  assert.match(html, /<a href="\/join"[^>]*>Open the join sign<\/a>/);
});
