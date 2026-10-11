# Startup Showdown: Context Packet

Paste or point a new session at this file first. It tells you what exists, what is decided, and what to do next. Date written: 2026-10-11.

## 1. What this is
"Startup Showdown" is Round 2 of "Future Makers": a 30-minute head-to-head game. Two companies of five roles each (CEO, CTO, CFO, CMO, COO), 8 games run one after another (80 players). It runs on a **Raspberry Pi 5 (8 GB)** with its own Wi-Fi hotspot, offline LAN, browser clients (laptops and phones). Host address: **10.42.0.1** typed into the browser, QR code as backup, systemd auto-start.

## 2. Status
- Spec approved: `Future_Makers_Round_2_Startup_Showdown_Master_Guide.md` (Sections 0 to 12). This is the source of truth for rules.
- Seven implementation plans approved, **nothing built yet, no git repository yet** (`docs/superpowers/plans/`, read `README.md` there first). The user said not to start until they say so and give a git link. **Ask before creating a repo or writing product code.**
- UI design drafts finished (this session): `ui-drafts/`. They are HTML drafts only, not product code.
- Recommended build method (user has not chosen): subagent-driven, a fresh helper per task and a review after each.

## 3. Plans (build in this order)
1. `2026-10-11-core-server.md`: roster, logins, lobby, start and end game, timer, resume after restart, WebSocket, boot on power-up.
2. `-screens-ideation-shop.md`: static server, login, organizer console, ideation vote and CEO pick, shop, wallet, CFO queue, summary card.
3. `-competition-engine.md`: sales curve, 5-second samples, hints, attacks and shield, market event, coin injection, warnings.
4. `-mini-games.md`: seven puzzles, difficulty, skips, rewards, CFO puzzle screen.
5. `-graphs-export-backup.md`: three end graphs, reveal and Next Game flow, images, Excel, backups.
6. `-deploy-and-rehearsal.md`: Pi hotspot, install scripts, 14-device load test, balance simulation, event checklist.
7. `-ui-design-implementation.md`: **OUT OF DATE. It describes the old navy/gold design. Rewrite it for the cream/orange drafts before running it** (see section 6).

Rules for every plan: test first (red, green, refactor), offline only (no CDN), plain HTML/CSS/JS with pure `render` functions, everything recorded in the `events` table, Plans 3 to 6 are written against earlier plans' interfaces.

## 4. Key tech
Node.js 20+ ES modules, `ws`, `better-sqlite3`, `node:test`; plain HTML/CSS/JS; hand-drawn SVG graphs; ExcelJS; @resvg/resvg-js for PNG; bundled offline fonts. SQLite backups to USB every 5 minutes.

## 5. Game rules (short, the guide has the full text)
- Phases: Briefing 3 min (role changes only here), Ideation 3 min (CEO final pick, auto-pick on timeout, early end adds time to shop), Shop 7 min (set to 90-second sale timing per the user), summary card 20 s, Competition 16 min.
- Shared wallet 1,000 coins. CFO-approved purchases floor at -200; attacks and skip penalties can go lower. CFO decides requests one at a time, oldest first. CTO features go to CEO first, then CFO. CEO can recommend any item. Rejected items can be re-requested (not in the same shop phase; after 60 s in competition). Open requests auto-reject at phase end. Shop closes at 30 s left. Attacks locked in the last 60 s.
- Sales: coins per minute from points (13 at 1, 20 at 2, 27 at 3, linear from 0 below 1). CTO = average of best 3 of 6 feature slots + 1 per part (first 4). CMO = average of target user + ad campaign slots + 2 brand + 2 tagline. COO = fixes (0/13/20/27) + backup 2 + test 1/2. A careful company earns about 71 coins/min, about 1,140 over 16 min.
- 9 hidden attacks (CEO only). Attack Shield (COO, 150 coins, once per game, cannot be rebought). One organizer market event and one coin injection (500 max) per game. Attacked company sees a market reason, never "attack".
- Warnings at 5 min, 2 min, 30 s, then red for the last 10 s.
- Recording: events per Admission ID, per-game and whole-event .xlsx, SQLite backups.
- **No scoring, no judges, no winner.** End graphs only (coins over time, sales per minute, where coins went). Organizer reveals; players see "Thank you for playing" until then. Next Game then Game Completed; logging in later still shows your own game's graphs.
- Organizer picks the pairing of companies by hand. Investor Q&A and role swap were removed.

## 6. UI drafts (the new visual style)
Folder `ui-drafts/`. Open any `*.html` there, or the self-contained copies in `ui-drafts/standalone/` (fonts and CSS inlined, work offline on any laptop).

Style: cream paper `#FBF0D9`, bold orange `#FF6A1F`, ink `#111`, blue `#2E6BFF` for Company Beta, thick black outlines, hard offset shadows, cut corners, Alfa Slab One and Archivo Black headlines, Space Mono small text, halftone dots, simple SVG illustrations. Fonts are in `ui-drafts/fonts/` (woff2).

Shared CSS: `draft.css` (fonts, colours, cut and shadow technique, login layout), `shell.css` (organizer shell), `play.css` (player screens, plus sections for the live monitor, final results and home). Global `[hidden] { display: none !important; }` is needed.

Screens drafted:
| File | Screen |
| --- | --- |
| `login.html` | Player login |
| `organizer.html` | Organizer login |
| `organizer-lobby.html` | Organizer lobby and role assignment |
| `home.html` | Player welcome / waiting screen |
| `briefing.html` | Game briefing and role reveal |
| `ideation.html` | Base idea selection and live voting |
| `workshop-cto.html` | CTO product workshop |
| `studio-cmo.html` | CMO brand studio |
| `workshop-coo.html` | COO risk and protection workshop |
| `treasury-cfo.html` | CFO treasury and approval queue |
| `command-ceo.html` | CEO command center |
| `monitor-organizer.html` | Organizer live monitor (both companies, real attack causes; players must never see it) |
| `results.html` | Final results: "Thank you" state, then three graphs |

Each draft has small draft-only JS (countdowns, fake data, a "Draft only" control bar). Strip that when building the real screens. Players must only ever see their own company.

### Differences between the user's reference images and the approved game (already resolved in the drafts)
- Reference scores (Market Impact, ROI, Sustainability, Judge feedback, winner and trophy) do not exist in the game. Drafts use coins, sales per minute, spend and the three graphs instead.
- No rupee symbol: the currency is "coins".
- Reference start/load/past-results menu became the waiting screen with a locked "My graphs" tile.
- Company names Alpha / Beta are placeholders; the real names and ideas come from the organizer's pairing and the CEO's pick.
- Old `docs/design/ui-design-system.md` and `mockup.html` are superseded by `ui-drafts/`.

### Still to do on the UI
- Missing drafts: Summary card (20 s), the player Competition screens with sales meters, hints and the attack deck, the CFO puzzle screen, any extra organizer screens. Ask the user whether they want to send references for these or have them designed from the existing style.
- Rewrite Plan 7 from the drafts, then update `docs/design/`.
- Open design decisions were listed earlier and have not been put to the user yet (reference vs rule conflicts above are the main ones).

## 7. Files and data
- Spec: `Future_Makers_Round_2_Startup_Showdown_Master_Guide.md` (and `(1).docx` copy).
- Content data: `data/problems.json`, `data/idea_options.csv`, `data/shop_catalog.csv`. `*_DRAFT.csv` files in the root are older working copies.
- Plans: `docs/superpowers/plans/`.
- Draft verification method: headless Chromium through Playwright (screenshots at 1672x941, 1024, 390 px, check no horizontal overflow, run interaction scripts). Playwright browsers live in `~/.cache/ms-playwright`; the scripts themselves were in a temporary folder and are gone.

## 8. How the user works (follow this)
- One question at a time, simple words, finalize things into the guide.
- Does not want product code until they say so. HTML design drafts were explicitly requested.
- After every HTML file made, send it to the user with the file-send tool as a single self-contained file (they are on a Windows laptop, the session runs on a Linux PC).
- References from the user are guides, not exact copies ("they do not have to be EXACTLY LIKE THIS").
- Check your own diff first when something breaks right after your edit.

## 9. First steps for the new session
1. Read this file, then the guide, then `docs/superpowers/plans/README.md`.
2. Ask the user for the git link and to confirm start of building (they said they would provide it).
3. Create the repo, copy the guide, plans, `data/` and `ui-drafts/` into it, commit.
4. Choose the build method with the user (recommended: subagent-driven), then begin Plan 1.
5. Before Plan 7, rewrite it for the cream/orange style.
