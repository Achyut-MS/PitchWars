import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPTS = ['install.sh', 'setup-hotspot.sh', 'uninstall.sh', 'check.sh'].map((f) => `deploy/${f}`);
const PATH = process.env.PATH;
const sh = (script, args = [], env = {}) =>
  spawnSync('bash', [script, ...args], { env: { PATH, HOME: process.env.HOME, ...env }, encoding: 'utf8' });

const dir = mkdtempSync(join(tmpdir(), 'showdown-deploy-'));
const ENV_FILE = join(dir, 'etc', 'showdown.env');
const UNIT_FILE = join(dir, 'showdown.service');
const GOOD = { ORGANIZER_PASSWORD: 'Sup3r-secret-pw', SERVICE_USER: 'showdown', ENV_FILE, UNIT_FILE };

test('every script passes bash -n', () => {
  for (const s of SCRIPTS) assert.equal(spawnSync('bash', ['-n', s]).status, 0, s);
});

test('shellcheck is clean when it is installed', (t) => {
  if (spawnSync('shellcheck', ['--version']).status !== 0) return t.skip('shellcheck not installed');
  const r = spawnSync('shellcheck', ['-S', 'warning', ...SCRIPTS], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout);
});

test('install dry run: exit 0, key steps, nothing written, password never printed', () => {
  const r = sh('deploy/install.sh', ['--dry-run'], { ...GOOD, WIFI_PASSWORD: 'wifi-pass-123' });
  assert.equal(r.status, 0, r.stderr);
  for (const re of [/npm ci --omit=dev/, /systemctl enable showdown/, /mode 600/, /\/etc\/showdown|showdown\.env/, /Checklist/, /BACKUP_DIR=/])
    assert.match(r.stdout, re);
  assert.equal(readdirSync(dir).length, 0, 'dry run wrote files');
  assert.equal((r.stdout + r.stderr).includes(GOOD.ORGANIZER_PASSWORD), false);
  assert.equal((r.stdout + r.stderr).includes('wifi-pass-123'), false);
});

test('the installed unit has real paths: no /home/pi, no placeholder, no leftover @tokens@', () => {
  const r = sh('deploy/install.sh', ['--dry-run'], { ...GOOD, INSTALL_DIR: process.cwd() });
  const unit = r.stdout.split('----- showdown.service -----')[1].split('----------------------------')[0];
  assert.equal(unit.includes('/home/pi'), false);
  assert.equal(unit.includes('change-me-before-the-event'), false);
  assert.equal(/@[A-Z_]+@/.test(unit), false);
  assert.match(unit, new RegExp(`WorkingDirectory=${process.cwd()}`));
  assert.match(unit, /^User=showdown$/m);
  assert.match(unit, /^EnvironmentFile=.*showdown\.env$/m);
  assert.match(unit, /CAP_NET_BIND_SERVICE/);
  assert.match(unit, /Restart=always/);
  assert.equal(/ORGANIZER_PASSWORD/.test(unit), false);
});

test('the unit template itself carries no hard-coded home or password', () => {
  const t = readFileSync('deploy/showdown.service', 'utf8');
  assert.equal(t.includes('/home/pi'), false);
  assert.equal(t.includes('change-me'), false);
});

test('install refuses the placeholder and short passwords', () => {
  for (const pw of ['change-me-before-the-event', 'short', '1234567']) {
    const r = sh('deploy/install.sh', ['--dry-run'], { ...GOOD, ORGANIZER_PASSWORD: pw });
    assert.equal(r.status, 1, pw);
    assert.match(r.stderr, /example password|at least 8/);
    assert.equal(r.stdout.includes('+ '), false, 'nothing may be planned before the refusal');
  }
});

test('install refuses a bad Wi-Fi password and a non-root real run', () => {
  assert.equal(sh('deploy/install.sh', ['--dry-run'], { ...GOOD, WIFI_PASSWORD: 'tiny' }).status, 1);
  if (process.getuid && process.getuid() !== 0) {
    const r = sh('deploy/install.sh', [], GOOD);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /root/);
    assert.equal(readdirSync(dir).length, 0);
  }
});

test('install says how to get Node 22 when it is missing, and does not echo a generated-password line in a dry run', () => {
  const r = sh('deploy/install.sh', ['--dry-run'], { ...GOOD, ORGANIZER_PASSWORD: '', NODE_BIN: '/nonexistent/node' });
  assert.match(r.stderr, /nodesource/);
  assert.equal(/GENERATED ORGANIZER PASSWORD/.test(r.stdout), false);
  assert.match(r.stdout, /would generate/);
});

test('install on the wrong OS or CPU warns in a dry run', () => {
  const rel = join(dir, 'os-release');
  writeFileSync(rel, 'ID=ubuntu\nVERSION_CODENAME=noble\n');
  const r = sh('deploy/install.sh', ['--dry-run'], { ...GOOD, OS_RELEASE_FILE: rel, ARCH: 'x86_64' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /WARNING: This is built for Raspberry Pi OS/);
});

test('hotspot dry run prints the fixed address, WPA2, shared mode, no power save, and hides the password', () => {
  const r = sh('deploy/setup-hotspot.sh', ['--dry-run'], { WIFI_PASSWORD: 'goodpass123', WIFI_SSID: 'Showdown', COUNTRY: 'IN' });
  assert.equal(r.status, 0, r.stderr);
  for (const re of [/802-11-wireless\.mode ap/, /802-11-wireless\.band bg/, /ipv4\.method shared/, /ipv4\.addresses 10\.42\.0\.1\/24/,
    /wifi-sec\.key-mgmt wpa-psk/, /connection\.autoconnect yes/, /connection\.autoconnect-priority 100/, /802-11-wireless\.powersave 2/,
    /do_wifi_country IN/, /connection add/, /game address is 10\.42\.0\.1/]) assert.match(r.stdout, re);
  assert.equal(r.stdout.includes('goodpass123'), false);
});

test('hotspot dry run modifies instead of adding when the connection exists; country only when asked', () => {
  const r = sh('deploy/setup-hotspot.sh', ['--dry-run'], { WIFI_PASSWORD: 'goodpass123', HOTSPOT_EXISTS: '1' });
  assert.match(r.stdout, /nmcli connection modify showdown-hotspot/);
  assert.equal(r.stdout.includes('connection add'), false);
  assert.equal(r.stdout.includes('do_wifi_country'), false);
});

test('hotspot refuses short, long and missing passwords, bad country and bad channel before printing any command', () => {
  const cases = [{}, { WIFI_PASSWORD: 'short' }, { WIFI_PASSWORD: 'x'.repeat(64) },
    { WIFI_PASSWORD: 'goodpass123', COUNTRY: 'india' }, { WIFI_PASSWORD: 'goodpass123', CHANNEL: '40' }];
  for (const env of cases) {
    const r = sh('deploy/setup-hotspot.sh', ['--dry-run'], env);
    assert.equal(r.status, 1, JSON.stringify(env));
    assert.equal(r.stdout.includes('nmcli'), false);
  }
  assert.match(sh('deploy/setup-hotspot.sh', ['--dry-run'], { WIFI_PASSWORD: 'short' }).stderr, /8 to 63 characters/);
});

test('uninstall dry run removes the service but never data or backups', () => {
  const r = sh('deploy/uninstall.sh', ['--dry-run', '--remove-settings', '--remove-hotspot'], GOOD);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /systemctl disable --now showdown/);
  assert.match(r.stdout, /nmcli connection delete showdown-hotspot/);
  assert.match(r.stdout, /left alone/);
  assert.equal(/rm .*(data|backups)/.test(r.stdout), false);
  assert.equal(sh('deploy/uninstall.sh', ['--bogus']).status, 2);
});

test('check dry run lists what it checks; a real run passes against a healthy server and fails against a broken one', async () => {
  assert.match(sh('deploy/check.sh', ['--dry-run']).stdout, /\/join/);
  const server = createServer((req, res) => { res.statusCode = req.url === '/join' ? 200 : req.url === '/' ? 200 : 404; res.end('ok'); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const env = { SKIP_SYSTEMD: '1', SKIP_NMCLI: '1' };
  const run = (b) => new Promise((resolve) => {
    import('node:child_process').then(({ execFile }) =>
      execFile('bash', ['deploy/check.sh'], { env: { PATH, ...env, BASE_URL: b }, encoding: 'utf8' }, (err, stdout) => resolve({ status: err ? err.code : 0, stdout })));
  });
  const good = await run(base);
  assert.equal(good.status, 0, good.stdout);
  assert.match(good.stdout, /Date and time now/);
  assert.match(good.stdout, /set it before the event/);
  server.close();
  const bad = await run('http://127.0.0.1:1');
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /\[FAIL\]/);
});
