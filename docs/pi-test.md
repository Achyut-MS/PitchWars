# Testing on the Raspberry Pi

One command checks the install and measures the load. It lives on its own branch (`pi-test-scripts`), so you can run it on the Pi without touching the main line of the game.

## 1. On the Pi (health check only)

```
bash scripts/pi-test.sh --on-pi
```

It checks that the service is running, that `/` and `/join` answer, that the hotspot is up, that there is disk space, and it prints the date (the Pi has no clock battery: set it before the event). Results are saved in `pi-test-results/`.

## 2. From a laptop on the Pi's Wi-Fi (health check plus load test)

1. Join the Pi's hotspot with the laptop (`/join` on the Pi shows the Wi-Fi name and password).
2. Use a **rehearsal database** on the Pi, not the event one: the load test imports 80 fake participants (`LT00`..`LT79`) and starts a game.
   ```
   sudo systemctl stop showdown
   mv data/showdown.db data/showdown.event.db      # keep the real one safe
   sudo systemctl start showdown
   ```
3. On the laptop, in a copy of this branch with `npm ci` done:
   ```
   ORGANIZER_PASSWORD='<the Pi organizer password>' bash scripts/pi-test.sh --smoke     # about 40 seconds
   ORGANIZER_PASSWORD='<the Pi organizer password>' bash scripts/pi-test.sh --profile devices
   ORGANIZER_PASSWORD='<the Pi organizer password>' bash scripts/pi-test.sh --profile full
   ```
   Run one profile per game: restart the service on the Pi between profiles (`sudo systemctl restart showdown`) and delete the rehearsal database if the previous game is still marked running.
4. While it runs, on the Pi: `top`, and note the `node` CPU % and RES (memory) columns. These are not visible from the laptop.
5. Afterwards put the event database back:
   ```
   sudo systemctl stop showdown
   mv data/showdown.event.db data/showdown.db
   sudo systemctl start showdown
   ```

## Reading the result

`PASS` means every limit in `docs/load-test.md` held (clock jitter, update delay, errors, reconnect after everybody drops). A `FAIL` names which one. Wi-Fi is the likelier limit on a Pi, not the CPU: if jitter or the reconnect time fails, try fewer devices on the same channel, a different Wi-Fi channel, and make sure Wi-Fi power saving is off (`deploy/setup-hotspot.sh` does that).

Use `--dry-run` to see what a command would do without running it.
