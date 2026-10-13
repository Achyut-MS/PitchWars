# Resume sheet (paused 2026-10-13 09:05 IST)

Everything below was true at the pause. Nothing was running except the last browser check (see section 4). Start here to continue.

## 1. Where the code is

| Branch (on `origin`) | What it holds | Status |
| --- | --- | --- |
| `main` (`db35810`) | Plans 1 to 7 built, 781 tests passing | pushed |
| `build/hardening` (`f4bb034`, this file on top) | Audit fixes: per-socket flood limit, per-IP throttles, newest-login-wins, strict CSP, per-company request numbers, token expiry, events index, README, guide section 13 items 15, two-tab fix | pushed, **not yet merged into `main`** |
| `fix/roster-duplicates` (`bad887a`) | same ID with a different name is reported in `rejected` | pushed, **not merged** (branched from `6dad344`) |
| `fix/hints-base-rates` (`81cbc22`) | hints trigger on base role rates, not attack or event effects | pushed, **not merged** |
| `fix/backup-stuck-guard` (`0f9c8b8`) | a timed-out backup blocks overlapping backups until it settles | pushed, **not merged** |
| `pi-test-scripts` (`ed9a86e`) | `scripts/pi-test.sh` + `docs/pi-test.md` (health check + load test against the Pi) | pushed, standalone branch (own branch on purpose) |
| `build/plan-1-core-server`, `build/plan-2-screens`, `build/server-clock` | old build branches, all contained in `main` | pushed, can be deleted later |

Local-only: the `.claude/` worktree folders (ignored by git). Nothing uncommitted.

## 2. Completed

- Plans 1 to 5 (core server, screens, ideation and shop, competition engine, mini games, graphs, Excel export, backups), Plan 6 scripts (balance simulator, full-game test, join sign, rehearsal speed, load test, Pi installer and hotspot scripts, event-day checklist), Plan 7 (cream and orange look, 16 tasks).
- Reviews and fixes for every task (fix rounds recorded in `.superpowers/sdd/*/progress.md`, local and git-ignored) and a final whole-product audit (no Critical findings; its Important findings were fixed on `build/hardening`).
- Test reliability: fixed sleeps replaced by wait-for-condition helpers (`d2e6127`, `7a38256`). `main`: 781 pass, 0 fail, 1 skipped. `build/hardening` branch tip: 806 of 807 pass (1 skipped).
- Real-browser checks: two passes on the Competition path, plus CSP and puzzle checks on the hardening branch: 0 violations on every player screen and all seven puzzle kinds.
- The old "end game" button is gone; the order is Competition, Reveal, Next Game. Downloads panel is always visible.

## 3. To do (in this order)

1. **Merge into `build/hardening`:** `fix/roster-duplicates`, `fix/hints-base-rates`, `fix/backup-stuck-guard` (they touch different files: `src/roster.js`, `src/hints.js`, `src/server.js`/`src/index.js` backup code; expect at most trivial conflicts in tests). Then run the full suite once on a quiet machine (`npm test`, about 35 s; never two suites at once).
2. Merge `build/hardening` into `main` and push.
3. **Finish the browser checks** (checkpoints in section 4): organizer end of game (Reveal, graphs on player results under the CSP, "Thank you" only before Reveal, Next Game), the five Downloads (xlsx zip signature, PNG signature, `curl` without token = 403), `/join` at 390 and 1280 px with `zbarimg` decode, organizer at phone width in the Reveal and Downloads states, the backup status line with `BACKUP_EVERY_MS=5000`.
4. **Small issues found, not yet fixed:**
   - A roster paste whose first line is comma-separated but later lines are TAB-separated is rejected with the misleading reason "blank name" (delimiter is chosen from the first line only: `src/roster.js` / `src/csv.js`). Either detect the delimiter per line or give a clearer reason.
   - Coin-injection validation message for `1.5` may vanish within a second because `public/organizer.js` clears `ui.error` on every state message (unconfirmed; re-test).
   - The organizer lobby keeps `-` in the seat selects if a second organizer tab seats players (only matters with two organizer tabs).
   - Download tokens in the URL can be lost if a download is opened in a new tab (usability only).
   - Lits appears rarely at level 4 (generation budget); tune if wanted.
   - Replace the `Attack Shield` public shop item name if you do not want the word "attack" in every shop.
5. **Needs real hardware:** run `deploy/install.sh`, `deploy/setup-hotspot.sh`, `deploy/check.sh` on the Pi; run `scripts/pi-test.sh` from a laptop on the Pi's Wi-Fi (branch `pi-test-scripts`, `docs/pi-test.md`); scan the `/join` QR codes with real phones; set the Pi's date (no clock battery); rehearse a full game at `SHOWDOWN_SPEED`; follow `docs/event-day-checklist.md`.
6. **Needs you (decisions):** references for the screens that had no draft (summary card, Competition, CFO puzzle panel, extra organizer screens); A orange and B blue everywhere; "Company A/B" naming or real names; which draft panels to build; the real Makerspace logo (replace `public/img/logo.svg`; the Canva connector needs `/mcp` sign-in); organizer page `<h1>`; Node 22 on the Pi.

## 4. Browser check checkpoints

**Agent C (organizer, graphs, downloads), scripts in `/tmp/claude-1000/browserC/`** (temporary; may be cleaned): done: scenarios 1 and 2 pass, scenario 3 mostly pass, scenario 7 partial; 36 of 38 checks passed, no CSP violations, no alerts. Not done: scenario 4 (end of Competition), 5 (downloads), 6 (`/join`), the rest of 7. Re-run with `cd /tmp/claude-1000/browserC && node run.mjs` (delete the old `cs.db*`/`cf.db*` files and `-bk` folders first; `SPEED=60 node run.mjs` for the fast run). The script boots the server itself on 8347 (8348 fast). Screenshots in `/tmp/claude-1000/browserC/shots/`.

**Agent B (reload, tabs, rate limit), scripts in `/tmp/claude-1000/browserB/` (`lib.mjs`, `s1.mjs` to `s5.mjs`; each wipes its DB, boots the server on 8231 to 8235 and kills it by port; re-run with `cd /tmp/claude-1000/browserB && node s1.mjs`):**
- S1 new-login-wins: **FAIL on the code before `f4bb034`** (two tabs kicked each other about once a second, raw "logged_in_elsewhere" toast, organizer showed 62x). The fix `f4bb034` is on `build/hardening` and was verified in a browser by the other agent (count stays at 1 for 30 s; "Use this device" gives exactly one more swap). **Re-run `s1.mjs` against `build/hardening` to confirm.**
- S2 plain reload in every phase: pass. One gap: A-CTO's reload at speed 60 landed in Competition, so only B-CEO was seen on the thank-you screen.
- S3 server killed 18.6 s mid-Competition and restarted on the same DB: pass (all clients reconnect by themselves, clock continues).
- S4 per-company request numbers, out-of-order refusal, double-click approves once: pass.
- S5 rate limit: first run invalid (the shop-tap loop sent 0 frames because the shop was not open). Observed: raw 200 msg/s floods were dropped after 80 messages, authenticated or not, and other players kept getting ticks; 30 submit-button clicks gave 5 to 8 frames. **Still to do:** 10 taps/s for 5 s on shop buttons in the Shop and on puzzle submit in Competition (fix `s5.mjs`: wait for the shop and a picked idea first).
- S6 not run: two organizer tabs; wrong organizer password 6 times from one context (note: the browser is on loopback, which is exempt from the per-IP throttle, so the real behaviour needs a second machine).
- Minor: `src/skip.js:15` tells the organizer to "use End game", but that action no longer exists (Next Game ends a game); fix the text.

## 5. How to continue quickly

- Read `README.md` (run commands, env vars, folder map, docs index) and `docs/event-day-checklist.md`.
- Test: `npm test` (Node 22). Dev-only browser walk: `PW_DIR=/path/to/playwright-core-install node scripts/visual.mjs live <outdir>`.
- Run locally: `ORGANIZER_PASSWORD=<8+ characters> PORT=8080 npm start`; players open `/`, organizer opens `/organizer.html`, join sign at `/join`. Use the organizer's "skip to next phase" button (rehearsal only) to move quickly.
