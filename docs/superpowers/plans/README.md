# Startup Showdown: Implementation Plans

The spec is `Future_Makers_Round_2_Startup_Showdown_Master_Guide.md` in the project root. The game is built in seven plans, **in this order**. Each plan produces working, tested software, and each one builds on the one before it.

| # | Plan file | What it builds |
| --- | --- | --- |
| 1 | `2026-10-11-core-server.md` | Roster, logins, lobby, start and end game, synchronized timer, resume after restart, WebSocket channel, boot on power-up. |
| 2 | `2026-10-11-screens-ideation-shop.md` | Static web server, login page, organizer console, ideation voting and CEO pick, the shop, wallet, CFO queue, summary card, per-player views. |
| 3 | `2026-10-11-competition-engine.md` | Role levels and the coin trickle, 5-second samples, hints, attacks and shields, market event, coin injection, countdown warnings, Competition screens. |
| 4 | `2026-10-11-mini-games.md` | The seven puzzles (generator and checker for each), difficulty, skips, rewards, the CFO's puzzle screen. |
| 5 | `2026-10-11-graphs-export-backup.md` | The three end graphs, reveal and Next Game flow, saved images, Excel workbooks, automatic backups. |
| 6 | `2026-10-11-deploy-and-rehearsal.md` | The Pi hotspot, install scripts, a 14-device load test, a balance simulation, the event-day checklist. |
| 7 | `2026-10-11-ui-design-implementation.md` | The final look from the approved drafts in `ui-drafts/` (cream paper, orange for Company A, blue for Company B, thick outlines, hard shadows, cut corners): offline fonts, colour tokens, company theming by `data-company` from the player's own company only, the header strip, every screen restyled with all its hooks kept, a placeholder logo slot, contrast, phone-size and accessibility checks, optional screenshot regression. Run it after Plan 5, and re-check after Plan 6. |

## Rules that apply to every plan

- **Time:** never call `Date.now()` in game code; use the clock's `now()` passed in as `now`. The clock continues from the last heartbeat after a restart.
- **Test first.** Every task follows red, green, refactor (superpowers:test-driven-development).
- **Offline only.** No CDN, no external fonts or scripts. Dev dependencies are installed once while online, then copied to the Pi.
- **Plain HTML, CSS and JavaScript** in the browser. Screens are built from pure `render` functions that return HTML strings, so they are tested in Node without a browser.
- **Styling:** Plans 2 to 5 ship a plain working base stylesheet. **Plan 7 is the real visual design**, built from the approved drafts in `ui-drafts/` (see `CONTEXT_PACKET.md` section 6). `docs/design/ui-design-system.md` and `docs/design/mockup.html` describe an older navy and gold design and are **superseded**: no plan uses them any more. Logic tasks never depend on styling.
- **Everything is recorded** in the `events` table (Plan 1) against the Admission ID and the game number. Exports (Plan 5) are built from the tables.
- **Plan code is a starting point that the tests verify.** If a test in a plan fails because of a typo in the plan's code, fix the code, not the test, and note it in the task report.
- **Plans 3 to 6 are written against the interfaces of the plans before them.** If a plan's code changes an earlier interface, update the later plans in the same commit.
