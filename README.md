# Startup Showdown (Future Makers, Round 2)

A browser game for a school event. Two companies of five roles each (CEO, CTO,
CFO, CMO, COO) compete over 8 games, with up to 80 players in the room. One
Node server runs on a Raspberry Pi that makes its own Wi-Fi hotspot. Players use
their phones; the organizer runs the event from a laptop. No internet is needed
during the event.

## Run it locally

Needs Node 22 or newer.

    npm install
    ORGANIZER_PASSWORD=<8+ chars> PORT=8080 npm start

- Players open `/` and log in with their Admission ID.
- The organizer opens `/organizer.html` and uses the password.
- The join sign (Wi-Fi name, password, QR code) is at `/join`.

## Build and test

- `npm test` runs the whole suite (about 35 seconds; do not run two at once).
- `npm run load-test` runs the simulated-players load test (see `docs/load-test.md`).
- `node scripts/simulate-balance.js` prints the economy balance numbers.
- `node scripts/visual.mjs` (also `npm run visual`) takes screenshots. Dev only:
  it needs `playwright-core` installed outside the repo (`PW_DIR` points to it,
  `SIZES` picks screen sizes).
- `npm run icons` rebuilds the icons.

## Rehearsal tools

- The organizer console has "skip to next phase" (not allowed out of the Competition).
- `SHOWDOWN_SPEED=<number>` runs the clock faster; the organizer sees a "rehearsal" banner.
- Do not use either at the real event.

## Environment variables

| Name | Meaning |
|---|---|
| ORGANIZER_PASSWORD | Organizer password, 8+ characters. Required. |
| PORT | HTTP port. |
| DB_FILE | SQLite database file (default under `data/`). |
| BACKUP_DIR | Where backups go (default `backups`; the USB stick on the Pi). |
| BACKUP_EVERY_MS | Backup period during a game (default 300000, 5 minutes). |
| SHOWDOWN_SPEED | Clock speed multiplier for rehearsals (default 1). |
| WIFI_SSID, WIFI_PASSWORD | Wi-Fi name and password shown on the join sign (also read by `deploy/`). |
| JOIN_URL | Address printed on the sign / in its QR code (default `http://10.42.0.1`). |
| LOAD_URL, LOAD_PROFILE, LOAD_SMOKE, LOAD_WINDOW_S, LOAD_IDEATION_S, LOAD_SHOP_S, LOAD_MAX_*, LOAD_LAG_FILE | Load-test settings and pass limits; see `docs/load-test.md`. |

## Folder map

- `src/` server code (game rules, database, websocket, exports).
- `public/` the browser pages and scripts the server serves.
- `data/` game content: problems, idea options, shop catalog (CSV/JSON); the live database is also here.
- `docs/` guides and plans.
- `ui-drafts/` early HTML design drafts, not served.
- `scripts/` load test, balance simulation, screenshots, sign and icon builders.
- `deploy/` Raspberry Pi install, hotspot and systemd service scripts.
- `test/` the node:test suite.

## Docs

- `Future_Makers_Round_2_Startup_Showdown_Master_Guide.md`: the design spec. Section 13 lists where the product differs from it.
- `docs/superpowers/plans/` the build plans, and `plan-1-followups.md` for known follow-ups.
- `docs/event-day-checklist.md`
- `docs/deploy-on-the-pi.md`
- `docs/restore-from-backup.md`
- `docs/load-test.md`
- `docs/pi-test.md` exists only on branch `pi-test-scripts`.

## Branches on the remote

`main`, `build/plan-1-core-server`, `build/plan-2-screens`, `build/server-clock`,
`build/hardening`, `pi-test-scripts`.

## Rules of the game that the code enforces

- Players only ever see their own company; the rival is never named or shown.
- There is no scoring and no winner announcement in the game.
- Graphs and results are shown only after the organizer presses Reveal.
- Only the organizer sees backup status, downloads and warnings.
- Only Next Game ends a game; the clock is server-side.
- The CEO attacks, the CFO spends; an attacked company only sees a market-style reason.
- Hints never name the rival.
