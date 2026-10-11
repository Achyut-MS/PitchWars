# Plan 1 (core server): follow-ups for later plans

Found during Plan 1 reviews. Plan 1 is built and tested (76/76); these were deliberately not fixed there.

## Done
- ~~One server clock~~ Done: `src/clock.js`; the clock continues from the last heartbeat after a restart (`resumeActiveGame(db, clock)`).

## Plan 2 (screens, ideation, shop)
- Log organizer actions and `assign` / `unassign` / roster changes in `events` (`assign` does not call `logEvent` today).
- Return the roster `rejected` rows to the organizer in the upload response.
- Persist `ideationSavedSec` to the DB when ideation ends early (nothing in Plan 1 calls `endIdeationEarly`).
- Push a new view to clients when their status changes (start, replace, Next Game).
- Throttle organizer password attempts; ping dead sockets every ~30 s.
- Expose `unassign` in the organizer protocol.

## Deploy plan (Plan 6)
- The shipped unit has the placeholder password and `/home/pi` paths; the service exits and restarts until edited.
- Entry-point check compares an unresolved path with a realpath: a symlinked install dir exits silently.
- Install Node 22+ on the Pi; run `npm ci` on the Pi (native module). Manual boot and `kill -9` restart check not yet done.

## Graphs plan (Plan 5)
- Add an `events(admission_id)` index; log disconnect / reconnect.

## Known small gaps (parked with reasons)
- A first roster row literally `A1,Name` or `ID,Asha` is dropped as a header.
- A `;` or tab inside a quoted name on row 1 of a comma file makes the delimiter detection wrong.
- Multi-line quoted names and unterminated quotes in the roster are not handled.
- No schema-level one-active-game guard, FKs, or admission-id normalisation check; self-swap logs a bogus event; `endGame` errors are plain `Error`.
