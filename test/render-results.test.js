import test from 'node:test';
import assert from 'node:assert/strict';
import { renderScreen } from '../public/render.js';
import { renderOrganizer } from '../public/render-organizer.js';

const svgs = { companyVsCompany: '<svg id="a"></svg>', coinDifference: '<svg id="b"></svg>', roleBars: '<svg id="c"></svg>' };
const ended = (extra = {}) => ({
  me: { admissionId: 'S0', name: 'Asha', company: 'A', role: 'CEO', status: 'in_game' }, screen: 'game',
  clock: { phase: 'ended', remainingSec: 0 }, problem: { id: 1, title: 'x', statement: '' }, wallet: 1,
  idea: null, ideation: null, shop: null, owned: [], summary: null, ...extra,
});

test('before the reveal the player sees only a thank you', () => {
  const html = renderScreen(ended());
  assert.match(html, /Thank you for playing/);
  assert.equal(html.includes('<svg'), false);
});

test('after the reveal the three graphs show, and there is no winner text', () => {
  const html = renderScreen(ended({ results: svgs }));
  assert.equal((html.match(/<svg/g) || []).length, 3);
  assert.equal(/winner|loser|you won|you lost/i.test(html), false);
});

test('a completed player gets the graphs of their game', () => {
  const html = renderScreen({ screen: 'graphs', me: { name: 'Asha' }, gameId: 3, graphs: svgs });
  assert.equal((html.match(/<svg/g) || []).length, 3);
  assert.match(html, /Game 3/);
});

const orgGame = (g) => ({ screen: 'organizer', problems: [], participants: [], game: { id: 1, problemId: 1, clock: { phase: 'ended', remainingSec: 0 }, attacks: [], eventUsed: null, injectionUsed: null, puzzles: { A: { solved: 0, skipped: 0, coins: 0 }, B: { solved: 0, skipped: 0, coins: 0 } }, companies: { A: { wallet: 1, idea: null, pickSource: null, votes: {}, owned: [], queue: [], awaitingCeo: [] }, B: { wallet: 1, idea: null, pickSource: null, votes: {}, owned: [], queue: [], awaitingCeo: [] } }, ended: true, revealed: false, ...g } });

test('when the game has ended the organizer sees Reveal graphs, and after it Next Game and downloads', () => {
  const before = renderOrganizer(orgGame({}));
  assert.match(before, /id="reveal"/);
  assert.match(before, /id="next-game"/);
  const after = renderOrganizer(orgGame({ revealed: true }));
  assert.equal(after.includes('id="reveal" '), false);
  assert.match(after, /\/export\/game\/1\.xlsx/);
});

test('while the competition is still running there is no Reveal button, but Next Game is always there', () => {
  const html = renderOrganizer(orgGame({ ended: false, clock: { phase: 'competition', remainingSec: 300 } }));
  assert.equal(html.includes('id="reveal"'), false);
  assert.match(html, /id="next-game"/);
});

test('the results render output never uses winner, score, trophy or rank wording', () => {
  const outs = [
    renderScreen(ended()), renderScreen(ended({ results: svgs })),
    renderScreen({ screen: 'graphs', me: { name: 'Asha' }, gameId: 3, graphs: svgs }),
    renderScreen({ screen: 'graphs', me: { name: 'Asha' }, gameId: 3 }),
  ];
  for (const html of outs) assert.equal(/winner|score|trophy|rank/i.test(html), false);
});

test('the game id on the graphs screen is escaped', () => {
  const html = renderScreen({ screen: 'graphs', me: { name: 'x' }, gameId: '<img src=x>', graphs: svgs });
  assert.equal(html.includes('<img src=x>'), false);
});
