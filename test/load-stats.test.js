import test from 'node:test';
import assert from 'node:assert/strict';
import { percentile, summarize, jitterOf, gapsOf, evaluate, fmtTable } from '../scripts/load-stats.js';

test('percentile uses the nearest-rank method and copes with empty input', () => {
  const s = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.equal(percentile(s, 50), 50);
  assert.equal(percentile(s, 95), 100);
  assert.equal(percentile(s, 99), 100);
  assert.equal(percentile(s, 0), 10);
  assert.equal(percentile([], 95), 0);
  assert.equal(percentile([7], 99), 7);
});

test('summarize sorts and reports count, mean, p50, p95, p99 and max', () => {
  const v = Array.from({ length: 100 }, (_, i) => 100 - i); // unsorted 100..1
  assert.deepEqual(summarize(v), { count: 100, mean: 50.5, p50: 50, p95: 95, p99: 99, max: 100 });
  assert.deepEqual(summarize([]), { count: 0, mean: 0, p50: 0, p95: 0, p99: 0, max: 0 });
});

test('gapsOf turns timestamps into gaps and jitterOf measures distance from the expected gap', () => {
  assert.deepEqual(gapsOf([0, 1000, 2100, 2900]), [1000, 1100, 800]);
  assert.deepEqual(gapsOf([5]), []);
  assert.deepEqual(jitterOf([1000, 1100, 800, 1000], 1000), [0, 100, 200, 0]);
});

test('evaluate returns one PASS/FAIL row per check and an overall verdict', () => {
  const ok = evaluate({ jitterP99: 120, pushP95: 80, errors: 0, dropped: 0, rssGrowthMb: 12, lagP99: 15, reconnectMs: 900 },
    { jitterP99: 500, pushP95: 1000, rssGrowthMb: 100, lagP99: 200, reconnectMs: 10000 });
  assert.equal(ok.ok, true);
  assert.ok(ok.rows.every((r) => r.pass));
  const bad = evaluate({ jitterP99: 600, pushP95: 80, errors: 2, dropped: 0, rssGrowthMb: null, lagP99: null, reconnectMs: 900 },
    { jitterP99: 500, pushP95: 1000, rssGrowthMb: 100, lagP99: 200, reconnectMs: 10000 });
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.rows.filter((r) => !r.pass).map((r) => r.name), ['tick jitter p99', 'errors']);
  assert.equal(bad.rows.find((r) => r.name === 'server memory growth').pass, true); // unmeasured is skipped, not failed
  assert.equal(bad.rows.find((r) => r.name === 'server memory growth').skipped, true);
});

test('fmtTable aligns columns', () => {
  const t = fmtTable([['a', 'bbb'], ['cccc', 'd']]);
  assert.equal(t, 'a     bbb\ncccc  d');
});
