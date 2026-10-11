# Startup Showdown: UI Design System

Reference mockup: `docs/design/mockup.html` (open it in a browser; it follows the light or dark setting of the device). The mockup uses fallback fonts, because the real fonts are bundled later (see Fonts).

## Who and what

- **Who:** students about 20 years old, 10 per game, on phones and laptops, in one room, with a visible 30-minute clock.
- **Job of the interface:** show three numbers at a glance (the clock, the company wallet, the sales per minute) and make the one decision of the moment obvious.
- **Feel:** an esports broadcast crossed with a trading floor. Two sides, one clock, a lead that swings. It is not a dashboard and not a children's game.

## The idea in one line

Each company has its own colour. The player's whole screen takes their company's colour, so everyone always knows which side they are on, and the end graphs use the same two colours in the League of Legends style you showed.

## Colour tokens

| Token | Dark (default) | Light | Use |
| --- | --- | --- | --- |
| `--stage` | `#0A1424` | `#EEF2F8` | page background |
| `--panel` | `#101E33` | `#FFFFFF` | main surfaces |
| `--raised` | `#172A45` | `#E3EAF4` | clock block, inputs, hint |
| `--line` | `#263C5C` | `#C5D1E2` | rules and borders |
| `--text` | `#E9ECF2` | `#0F1B2E` | body text |
| `--muted` | `#9AAAC2` | `#4B5D78` | secondary text |
| `--a` / `--a-ink` | `#F5B83D` / `#1A1200` | `#8A5A00` / `#FFFFFF` | Company A (gold) |
| `--b` / `--b-ink` | `#2BC4B8` / `#00201E` | `#00756D` / `#FFFFFF` | Company B (teal) |
| `--hot` | `#FF5A68` | `#C0182B` | danger: last 10 seconds, the attack deck, errors |
| `--team` / `--team-ink` | alias of `--a` or `--b` | same | set by `data-company` on `<body>` |

Rules (checked with the WCAG formula, and re-checked by an automated test in Plan 7): body text, muted text, `--team` and `--hot` on `--stage`, `--panel` and `--raised` meet **4.5:1** in both themes; `--team-ink` on `--team` meets **4.5:1**; `--line` is decoration only and never the sole carrier of meaning. The button text colour is always `--team-ink`. The page sets `color-scheme` and follows `prefers-color-scheme`, with `[data-theme]` overriding it.

## Type

- **Display:** Big Shoulders Display (bold). Used for the clock, the wallet, the sales numbers, and headings. It is condensed and sporty, so large numbers stay narrow on a phone.
- **Body:** Instrument Sans (regular and bold). Used for everything that is read.
- Numbers always use `font-variant-numeric: tabular-nums` so digits do not jump.
- Scale: 14, 16, 20, 28, 40, then fluid 44 to 74 for the clock. Body line length stays under 70 characters.
- **Fonts are bundled** as `.woff2` files in `public/fonts/` (both are open-licence). Nothing loads from the internet.
- Avoid: all-caps labels, one word of a heading in a different colour, numbered markers where the content is not a sequence.

## Layout

- **The scoreboard strip** is the one bold element. Left: company and role, and the wallet (large). Centre: the clock block (largest number on the screen). Right: the player's name and the sales per minute. Corners are cut at 22 px like a broadcast lower-third. A 4 px bar in the company colour sits under it.
- **Below the strip**, panels are separated by space, a left rule in `--line` (or in the company colour for "our" panels), and heading size, not by identical rounded cards. Corners stay square.
- **Phone (360 to 520 px):** one column, the strip is compact (clock 44 px, wallet 28 px), the hint is a sticky bar. **Laptop:** two columns, sales meters on the left, shop on the right.
- Tap targets are at least 44 px high. The page never scrolls sideways.

## Screens

| Screen | What makes it distinctive |
| --- | --- |
| Login | One field, the Admission ID, large; the game title in the display face. |
| Briefing | The role as a big word in the company colour, the problem statement beneath, the countdown in the strip. |
| Ideation | Six idea panels; a thin vote bar fills in the company colour; the player's vote has a top rule in the company colour; only the CEO sees "Pick this idea". |
| Shop | Rows, not cards. Tiers are three dots filled in the company colour. Prices in the display face. Owned items dim. The CFO queue is a stack with the head row emphasised. |
| Summary card | A full-width banner with the idea name, then the bought items, then the coins left as the biggest number. |
| Competition | Three vertical sales meters (CTO, CMO, COO) like the teamfight bars, the total beneath. The hint is a calm panel with a company-colour top rule. The shop sits beside it. |
| CEO attack deck | A darker panel with a `--hot` left rule; nine tiles in a 3 by 3 grid (2 columns on small phones); disabled tiles dim during the cooldown. |
| End graphs | Coin difference: a zero line, gold area above it where A leads, teal below where B leads. Role bars: mirrored, A on the left, B on the right, each ending in a number. |
| Organizer console | A control-room layout: lobby table, then two company panels side by side, then the attack log in the real-cause wording. |

## Motion

- **One orchestrated moment:** when the phase changes, a **stinger** (a banner in the company colour with the phase name and one line) wipes across for about 1.1 seconds. Nothing else animates on its own.
- Responses to taps are short (under 150 ms): a button press, a number changing.
- `prefers-reduced-motion`: the stinger appears and disappears without wiping, and numbers change without rolling.

## Accessibility

- Visible focus ring (3 px, `--text`), never removed.
- Colour is never the only signal: states also use words ("Owned", "Requested"), and the two companies also differ by letter (A, B).
- The clock has an accessible name; banners use `role="status"`; errors use `role="alert"`.
- The graphs carry `role="img"` with a text description; the numbers are in the Excel export.

## Things to avoid (on purpose)

A cream page with a terracotta accent; a near-black page with one acid-green accent; newspaper rules and columns; the same rounded card with the same shadow everywhere; a tracked-out all-caps eyebrow above every heading; arrows on every button.
