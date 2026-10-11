import test from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { curve, roleRates } from '../src/levels.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test('the curve passes through 13, 20 and 27 and is flat above 3 points', () => {
  assert.equal(curve(0), 0);
  near(curve(0.5), 6.5);
  assert.equal(curve(1), 13);
  near(curve(2), 20);
  near(curve(2.5), 23.5);
  assert.equal(curve(3), 27);
  assert.equal(curve(4), 27);
  assert.equal(curve(-1), 0);
});

test('a company with nothing earns nothing', () => {
  assert.deepEqual(roleRates(data, []), { CTO: 0, CMO: 0, COO: 0 });
});

test('the CTO level is the average of its best three feature slots', () => {
  near(roleRates(data, ['F01-P']).CTO, 13);                                  // 3 / 3 = 1 point
  near(roleRates(data, ['F01-S', 'F02-S']).CTO, 13 + 7 / 3);                 // 4 / 3 = 1.33 points
  near(roleRates(data, ['F01-B', 'F02-B', 'F03-B']).CTO, 13);                // 3 / 3 = 1 point
  near(roleRates(data, ['F01-P', 'F02-B', 'F03-B']).CTO, 13 + 7 * (5 / 3 - 1));
  near(roleRates(data, ['F01-P', 'F02-P', 'F03-P']).CTO, 27);
});

test('features beyond the best three add nothing', () => {
  near(roleRates(data, ['F01-B', 'F02-B', 'F03-B', 'F04-B', 'F05-B', 'F06-B']).CTO, 13);
  near(roleRates(data, ['F01-P', 'F02-P', 'F03-P', 'F04-B']).CTO, 27);
  near(roleRates(data, ['F01-P', 'F02-P', 'F03-P', 'F04-P', 'F05-P', 'F06-P']).CTO, 27);
});

test('the CTO gets +1 per part, for the first four parts only', () => {
  near(roleRates(data, ['HC01']).CTO, 1);
  near(roleRates(data, ['HC01', 'HC02', 'HC03', 'HC04']).CTO, 4);
  near(roleRates(data, ['HC01', 'HC02', 'HC03', 'HC04', 'HC05', 'HC06']).CTO, 4);
  near(roleRates(data, ['SC01', 'SC02']).CTO, 2);
});

test('the CMO averages the target user and the ad campaign, plus 2 each for brand and tagline', () => {
  near(roleRates(data, ['M01-L']).CMO, curve(1.5));
  near(roleRates(data, ['M01-L', 'M04-E']).CMO, 27);
  near(roleRates(data, ['M01-L', 'M04-E', 'M02', 'M03']).CMO, 31);
  near(roleRates(data, ['M02']).CMO, 2);
});

test('the COO counts risk fixes and adds the backup and the test bonuses', () => {
  assert.equal(roleRates(data, ['O01']).COO, 13);
  assert.equal(roleRates(data, ['O01', 'O02']).COO, 20);
  assert.equal(roleRates(data, ['O01', 'O02', 'O03']).COO, 27);
  assert.equal(roleRates(data, ['O01', 'O02', 'O03', 'O04-H', 'O05-F']).COO, 31);
  assert.equal(roleRates(data, ['O05-B']).COO, 1);
  assert.equal(roleRates(data, ['O06']).COO, 0); // the shield earns nothing by itself
});

test('Feature Recall removes the best feature from the CTO average', () => {
  near(roleRates(data, ['F01-P', 'F02-B'], { recallBest: true }).CTO, curve(1 / 3));
});

test('Ad Blackout zeroes the ad slot, Safety Audit zeroes the risk fixes but keeps the extras', () => {
  near(roleRates(data, ['M01-L', 'M04-E'], { adOff: true }).CMO, curve(1.5));
  assert.equal(roleRates(data, ['O01', 'O02', 'O03', 'O04-S'], { riskOff: true }).COO, 2);
});

test('curve boundaries and clamps', () => {
  near(curve(0.25), 3.25);
  near(curve(1.0001), 13 + 7 * 0.0001);
  assert.equal(curve(2.9999) < 27, true);
  assert.equal(curve(100), 27);
  assert.equal(curve(Infinity), 27);
});

test('empty and unknown selections', () => {
  assert.deepEqual(roleRates(data, ['NOPE']), { CTO: 0, CMO: 0, COO: 0 });
  assert.deepEqual(roleRates(data, [], { recallBest: true, adOff: true, riskOff: true }), { CTO: 0, CMO: 0, COO: 0 });
});

test('Feature Recall with nothing to remove, and the test bonuses', () => {
  assert.equal(roleRates(data, ['HC01'], { recallBest: true }).CTO, 1);
  assert.equal(roleRates(data, ['O05-F']).COO, 2);
  assert.equal(roleRates(data, ['O01', 'O02', 'O03', 'O04-H', 'O05-F'], { riskOff: true }).COO, 4);
});
