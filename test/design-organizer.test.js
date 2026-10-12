import test from 'node:test';
import assert from 'node:assert/strict';
import { renderOrganizer, renderOrganizerLogin } from '../public/render-organizer.js';
import { ORGANIZER } from './fixtures/views.js';

test('organizer login: the shared login card with a labelled password field and no username', () => {
  const h = renderOrganizerLogin('Wrong password.');
  assert.match(h, /<form id="login" class="card"><h2>Organizer <b>Login<\/b><\/h2>/);
  assert.match(h, /<span class="sr-only">Password<\/span><input name="pw" type="password"/);
  assert.match(h, /<p class="error" role="alert">Wrong password\.<\/p>/);
  assert.equal(h.includes('name="username"'), false);
});

test('the frame links only to the sections on the page', () => {
  const lobby = renderOrganizer(ORGANIZER['org-lobby']);
  assert.match(lobby, /^<div class="frame"><div class="brandbox"><span class="logo" role="img" aria-label="Makerspace logo"><\/span><\/div>/);
  assert.match(lobby, /<nav class="side" aria-label="Organizer sections">[^]*href="#sec-roster"[^]*href="#sec-lobby"[^]*href="#sec-start"/);
  assert.equal(lobby.includes('href="#sec-controls"'), false);
  const running = renderOrganizer(ORGANIZER['org-running']);
  assert.match(running, /href="#sec-controls"[^]*href="#sec-companies"/);
  assert.equal(running.includes('href="#sec-roster"'), false);
});

test('the seat boards show each company\'s five roles with their own colour', () => {
  const h = renderOrganizer(ORGANIZER['org-lobby']);
  assert.match(h, /<section class="card company seats" data-company="A"><h3><svg class="mark"[^]*Company A <span class="count">5 \/ 5<\/span>/);
  assert.match(h, /data-company="B"[^]*Ananya Gupta[^]*DSA006/);
});

test('malformed views still do not throw inside the frame', () => {
  for (const v of [null, {}, { game: {} }]) assert.doesNotThrow(() => renderOrganizer(v));
});

test('the running game shows both companies in their own colours with the VS layout', () => {
  const h = renderOrganizer(ORGANIZER['org-running']);
  assert.match(h, /<main class="two" id="sec-companies"><section class="card company" data-company="A"><h2><svg class="mark"[^]*Company A<\/h2>/);
  assert.match(h, /<section class="card company" data-company="B">/);
  assert.match(h, /<span class="timer"><span class="pill"><span id="clock">4:05<\/span><\/span><\/span>/);
  assert.equal(h.includes('role="alert"'), false);
});

test('a hostile company key cannot reach data-company', () => {
  const v = structuredClone(ORGANIZER['org-running']);
  v.game.companies = { A: v.game.companies.A, '"><x': v.game.companies.B };
  assert.equal(renderOrganizer(v).includes('data-company="&quot;'), false);
});

test('every organizer control that Plans 3 and 5 added keeps its id', () => {
  const h = renderOrganizer(ORGANIZER['org-competition']);
  for (const id of ['inj-company', 'inj-coins', 'inj-ask']) assert.match(h, new RegExp(`id="${id}"`), id);
  assert.match(h, /href="#sec-attacks"/);
});
