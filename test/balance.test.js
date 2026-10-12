import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.js';
import { simulateBuyer, report } from '../scripts/simulate-balance.js';

const data = loadData('data');

test('a careful buyer with 1,000 coins earns about 60 to 80 coins per minute, about 1,000 over the competition', () => {
  for (const type of ['hardware', 'software']) {
    const r = simulateBuyer(data, type, 1000, 0);
    assert.ok(r.ratePerMinute >= 55 && r.ratePerMinute <= 80, `${type} ${r.ratePerMinute}`);
    assert.ok(r.earnedOver16Minutes >= 900 && r.earnedOver16Minutes <= 1300);
  }
});

test('the buyer never goes below the floor and spends nearly everything', () => {
  for (const floor of [0, -200]) {
    const r = simulateBuyer(data, 'hardware', 1000, floor);
    assert.ok(r.walletLeft >= floor);
    assert.ok(r.walletLeft - floor < 120);
  }
});

test('the extra 200 coins of debt buys a higher rate', () => {
  assert.ok(simulateBuyer(data, 'software', 1000, -200).ratePerMinute > simulateBuyer(data, 'software', 1000, 0).ratePerMinute);
});

test('the report has a line for each type and floor', () => {
  assert.equal(report(data).split('\n').length, 5);
});

test('with almost no coins the buyer buys little and earns little', () => {
  const r = simulateBuyer(data, 'hardware', 100, 0);
  assert.ok(r.ratePerMinute < 20);
});
