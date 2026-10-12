# Load test

Proves that the one-second tick, the pushes and the actions hold up with the real number of devices. It boots the real server (or targets one you already run), connects real WebSocket clients, plays the ideation, shop and Competition in real time and prints a PASS/FAIL table.

## What it models

- **Profile "full":** one game as it happens at the event: 10 players, the organizer and 70 idle lobby clients (the other participants waiting between games) who all receive every state push.
- **Profile "14 devices":** 10 players, the organizer and 3 spectators, all connected.
- Each player acts every 2 to 5 seconds at random (vote, pick, request, approve, attack, puzzle, refresh), plus bursts where all 10 act within one second (at the start of ideation, in the shop, and at 25%, 50% and 75% of the Competition window).
- The game is moved along with the organizer's Skip phase, then the Competition is measured for 90 seconds of real time (no fast clock).
- At the end every client is dropped and reconnects at once (the reconnect storm).

## Running it

```
npm run load-test                 # both profiles, about 4 minutes
LOAD_SMOKE=1 npm run load-test    # 14 clients, 10 s window, about 35 seconds
```

Locally it starts the server as a child process on a free port with a temporary database, and removes both afterwards. The server's RSS, CPU time, event-loop lag and database growth are measured through the child process.

### Against the Pi

Run it from a laptop joined to the Pi's Wi-Fi, so the Wi-Fi and the Pi are both in the measurement:

```
LOAD_URL=ws://10.42.0.1 ORGANIZER_PASSWORD='<the organizer password>' LOAD_PROFILE=full npm run load-test
LOAD_URL=ws://10.42.0.1 ORGANIZER_PASSWORD='<the organizer password>' LOAD_PROFILE=devices npm run load-test
```

- Run one profile per command (`LOAD_PROFILE=full` or `devices`): the second needs the first game to be over.
- The test imports 80 (or 14) participants named `LT00`, `LT01`, ... and starts a game with `LT00` to `LT09`. **Use a rehearsal database**, not the one for the event: stop the service, move `data/showdown.db` away, start it again, run the tests, then restore the real database (or delete it and start fresh).
- No game may be running on the Pi when the test starts.
- Server memory, CPU and event-loop lag are not visible over the network (the table shows SKIP). Run `top` on the Pi at the same time and note the server's CPU and RES columns.

### Settings

All limits can be changed with environment variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `LOAD_MAX_JITTER_P99_MS` | 500 | worst 1% of ticks may be this far from 1000 ms |
| `LOAD_MAX_PUSH_P95_MS` | 1000 | 95% of actions are answered / pushed within this |
| `LOAD_MAX_RSS_GROWTH_MB` | 100 | server memory growth during the run |
| `LOAD_MAX_LAG_P99_MS` | 200 | server event-loop lag (beyond the 10 ms sampling) |
| `LOAD_MAX_RECONNECT_MS` | 10000 | slowest client back with state after the storm |
| `LOAD_WINDOW_S`, `LOAD_SHOP_S`, `LOAD_IDEATION_S` | 90, 25, 6 | lengths of the measured window and the earlier phases |
| `LOAD_PROFILE` | both | `full` or `devices` |
| `ORGANIZER_PASSWORD` | a built-in test value | required for `LOAD_URL` |

The exit code is 0 when everything passes and 1 otherwise.

## Reading the table

- **tick jitter p99:** how far from 1000 ms the gap between two ticks was, for the worst 1% of ticks over all clients. This is what players feel as a stuttering clock.
- **push latency p95:** time from an action to the actor's new state, and from the action to the next state arriving at other clients. During the Competition everyone also gets a state push every second, so the latency to others is capped near 1000 ms by that; the shop rows show the true coalescing delay.
- **errors:** broken sockets, unexpected closes, `bad_message` and login failures. Refusals by game rules (for example "the shop is closed") are normal and counted separately.
- **dropped messages:** actions that never received any reply or push within 5 seconds.
- **server memory growth, event-loop lag:** only locally. Lag above a few tens of milliseconds means the server is busy; a growing RSS across profiles means a leak.
- **reconnect storm:** time until the slowest of all clients had a state again after everybody dropped at once.

## If it fails

1. Re-run once: a single spike (a Wi-Fi scan, a backup) can fail one run. Two failures in a row are real.
2. **Jitter or lag high, CPU near 100% of one core:** the Pi is the limit. Close other programs, check cooling (a hot Pi throttles), and make sure nothing else runs on it. If it persists, push less often (the Competition pushes everyone's state every second; see `COALESCE_MS` and the per-second push in `src/server.js`).
3. **Jitter high but CPU low:** the Wi-Fi. Try channel 1 or 11, move the Pi to the middle of the room, switch off other access points nearby.
4. **Errors or dropped messages:** read the "first errors" line. `unexpected close` means sockets dropped (Wi-Fi, or the server restarted); `bad_message` means the server rejected a message and should be investigated.
5. **Memory growth:** run again with a longer `LOAD_WINDOW_S` (for example 300). Steady growth is a leak; a one-off jump that levels off is not.
6. **Reconnect storm slow:** check that the server has CPU headroom and that the Wi-Fi accepts 80 simultaneous connections.
