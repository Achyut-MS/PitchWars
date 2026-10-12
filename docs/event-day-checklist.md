# Startup Showdown: Event-Day Checklist

For the organizer, with the Pi in front of you. Plain steps, tick the boxes. Things that can only be confirmed on the real Pi are marked **TO VERIFY ON THE PI**: do them at the rehearsal, not on the day.

Related pages: [Deploy on the Pi](deploy-on-the-pi.md) (install, update, hotspot), [Load test](load-test.md), [Restore from backup](restore-from-backup.md).

Fixed numbers to remember: 8 games in a row, 10 players each (two companies of five: CEO, CTO, CFO, CMO, COO). Join address `http://10.42.0.1`, also on the sign at `/join`. Rules are decided: do not change them on the day.

---

## A. The week before

**Pi and software**
- [ ] The Pi is installed and starts the game by itself on power-up (see [Deploy on the Pi](deploy-on-the-pi.md)).
- [ ] The latest version is installed (update steps are in the same page). Do not update in the last two days unless you must.
- [ ] Set the organizer password (at least 8 characters, not the placeholder `change-me-before-the-event`; the server refuses to start otherwise). Write it on the organizer's card (Section F). Do not stick it on the Pi.
- [ ] **Set the date and time on the Pi.** It has no clock battery and no internet, so it can be wrong after every power-off. The game does not need the right time, but the Excel files, backup file names and your notes do. Example: `sudo timedatectl set-time "2026-10-20 08:30:00"`. **TO VERIFY ON THE PI** (the exact command depends on the image).
- [ ] USB stick plugged in, and `BACKUP_DIR` points at it. Run a test game and check that a `showdown-during-...db` file appears after 5 minutes (details: [Restore from backup](restore-from-backup.md)). The organizer page shows "Last backup hh:mm, ok".

**Spares**
- [ ] A spare SD card with a cloned copy of the working image (clone it after the last update and the last rehearsal; label it with the date).
- [ ] A second USB stick for copying backups at the end.
- [ ] Power bank or UPS for the Pi, and a spare power cable. **TO VERIFY ON THE PI**: that the Pi stays up when the wall power is pulled (Pi 5 needs a strong supply, 5 V 5 A).
- [ ] A spare Wi-Fi router as plan B. **TO VERIFY ON THE PI**: write down the exact steps to get the Pi onto the router and which address people must type, because the printed sign says `10.42.0.1`. The game was designed for the Pi's own hotspot (no router), so only use this if the hotspot fails.
- [ ] Paper fallback: printed copies of the 8 problem statements with the six ideas under each (Master Guide, Section 9), and role cards. If everything fails you can still run a game by hand.

**Devices and people**
- [ ] Charge every laptop, phone and the organizer device. Bring chargers and one extension lead.
- [ ] Test with 14 real devices (10 players, the organizer, a few spare) on the Pi's own Wi-Fi: every device joins, logs in, and stays connected for a whole game. Tell testers to stay on the Wi-Fi even when the phone says "no internet".
- [ ] Run the [load test](load-test.md) against the Pi (both profiles, `full` and `devices`) from a laptop on its Wi-Fi. Use a rehearsal database, not the event database. Write the result at the bottom of this page.
- [ ] Run one full rehearsal at rehearsal speed (start the server with `SHOWDOWN_SPEED` set, for example 10; the organizer page shows a red banner "REHEARSAL SPEED x10 - NOT FOR THE EVENT"). Play all the way through: roster, seating, Briefing, Ideation, Shop, Summary, Competition, Reveal, downloads, Next Game, second game. Then set the speed back (remove `SHOWDOWN_SPEED`), restart, and confirm the banner is gone.
- [ ] Print the join sign: `node scripts/make-sign.js --password '<wifi password>'` makes `sign.html` (also open `http://10.42.0.1/join` while the game runs). Print one for each end of the room. Do not commit it: it holds the Wi-Fi password.
- [ ] Prepare the roster file (Section on format below) for all 80 players, plus a few spare rows.
- [ ] Organizer practice: you have done Start, a seat swap in the Briefing, Reveal graphs and Next Game at least once.

**Roster file format**

One player per line: Admission ID, then name. Comma, tab or semicolon all work (the first line decides). A header line is optional. Admission IDs are not case sensitive (`ab12` and `AB12` are the same).

```
admission_id,name
FM-001,Asha Rao
FM-002,Dev Patel
```

- Names with a comma in them go in double quotes: `FM-003,"Rao, Asha"`.
- A name that is just one cell is fine. A line with no ID or no name is rejected, and the console lists it ("Line 7: blank name"). An ID already on the list is skipped, not changed.
- You can save it from Excel as CSV (comma or semicolon) or paste it straight from Excel (tab).

---

## B. The morning of the event

**Set up the room**
- [ ] Pi on a socket nobody can walk into. Power bank or UPS connected if you have one. Cable tucked away. The Pi is also the network: if it loses power, everyone is offline.
- [ ] Join signs up at both ends of the room.
- [ ] Spare SD card, spare USB stick, spare cable, paper fallback and the organizer card within reach.

**Start and check**
- [ ] Power the Pi on. Wait one minute.
- [ ] Check the date and time (Section A). Set it if wrong.
- [ ] On your own phone: join the `Showdown` Wi-Fi, open `http://10.42.0.1`, confirm the player login page opens.
- [ ] On the organizer laptop: open `http://10.42.0.1/organizer.html`, log in with the organizer password.
- [ ] The red rehearsal banner is **not** showing. If it is, stop: the speed setting is still on. Fix it and restart before anyone arrives.
- [ ] The line "Last backup ..." shows or will show after the first game starts. USB stick is in.
- [ ] Import the roster (paste, or choose the file, then **Import roster**). Read the line "N added, N skipped, N rejected". Fix every rejected line with **Add participant** (Admission ID, name). Check the list shows all 80.
- [ ] Open the join sign from the console ("Open the join sign") and check the Wi-Fi name, password and address are right.
- [ ] Do not start a test game now. If you must test, use a rehearsal database, not the event one.

---

## C. Run sheet for each game (about 30 minutes)

Players log in with their **Admission ID only** (no name box). Logging in again is always fine.

### 1. Before the game (lobby)
- [ ] Ask the 10 players for this game to log in. They show as "lobby" on your list.
- [ ] Someone missing from the list? **Add participant** (ID and name), then they can log in.
- [ ] Seat every player: for each, pick the **company** (A or B) and the **role** in the two drop-downs next to their name. The seat is saved when both are chosen.
- [ ] Check: five roles in each company, one of each (CEO, CTO, CFO, CMO, COO). The pairing of companies is your choice. You pick it by hand.
- [ ] Choose the **problem statement** (one per game; use a different one every game, 1 to 8).
- [ ] Press **Start game**, then **Yes, start game** (two steps, to stop accidents). The clock starts for everyone. Players become "In Game".

### 2. Briefing: 3 minutes
- [ ] Players see their role and the problem statement. Nothing to click for them.
- [ ] **This is the only time you can change seats.** Use "Briefing seat changes":
  - **Swap seats**: pick two players, press the button.
  - **Replace player**: pick who leaves (an absent player) and who comes in (someone in the lobby), press the button.
- [ ] After the Briefing, seats and companies are locked. Every change is logged.

### 3. Ideation: 3 minutes
- [ ] Nothing for you to do. All five vote, the CEO's click is final. If the CEO does not pick, the most-voted idea is picked (ties at random).
- [ ] Both companies picked and you want to move on? Press **end ideation early**, then **Yes, end ideation early**. The saved time is added to the Shop. (It also ends by itself once both CEOs have picked; the button is for a company that is still dithering.)

### 4. Shop: 7 minutes (plus any time saved from Ideation)
- [ ] Watch both company panels: what is bought, the queue, "Waiting for CEO".
- [ ] Nothing to press. The CFO approves or rejects one request at a time. Requests still open at the end are rejected automatically.

### 5. Summary card: 20 seconds
- [ ] Every screen shows the company's product and coins left. Nothing to press.

### 6. Competition: 16 minutes
- [ ] Watch the clocks and the panels. The warnings at 5 min, 2 min and 30 s appear on the players' screens by themselves.
- [ ] **Market event (one per game):** choose Demand Surge, Demand Slump or Shop Sale, then confirm. It hits both companies the same way. Once used, the buttons go away.
- [ ] **Coin injection (one per game):** pick the company, type coins (1 to 500), press **Inject coins**, then confirm. Only that company is told, with a market-style reason. Use it for a glitch or a company far behind.
- [ ] **Attack log:** shows who attacked whom, the cost and whether a shield blocked it. You see the real cause. Players never see the word "attack" (the victim sees a market reason). Do not read this out loud.
- [ ] If a red **Warning: the ... phase could not finish** appears, see Section D.
- [ ] **Do not press "skip to next phase".** That button is only shown in the first phases (Briefing to Summary) and is for rehearsal and testing. Never use it at the real event, except to recover a game stuck on a phase (Section D).

### 7. After the timer: Reveal, download, Next Game
- [ ] At 0:00 players see "Thank you for playing" and are locked out. Take a moment: tell the room the graphs are coming.
- [ ] Press **Reveal graphs** when you are ready. All players and the console now show the three graphs.
- [ ] **Download before you press Next Game.** The download links ("Download this game (Excel)", "Download the whole event (Excel)", and the three graph PNGs) are shown only for the running game, after the reveal. When you press Next Game the console goes back to the lobby and the links are gone. Save:
  - [ ] **Download this game (Excel)**
  - [ ] The three graph images (PNG): Company vs company, Coin difference, Coins by role
  - [ ] (After the last game: also **Download the whole event (Excel)** while its game is still open.)
- [ ] Press **Next Game**, then OK in the box ("End this game and mark the players Game Completed?"). This is the **only** way a game ends; there is no "end game" button. The 10 players become "Game Completed". Their screens stay on their graphs and they cannot play again. A backup runs right after.

### 8. Changeover to the next game
- [ ] Thank the finished companies. They keep their graphs on screen; they may log in later to see them again.
- [ ] Bring in the next 10 players. Choose the new pairing by hand, seat them, choose the next problem statement, Start.
- [ ] Check "Last backup ... ok" before you start, and that the USB stick is still in.
- [ ] Time budget: about 30 minutes of play, plus 5 to 10 minutes of changeover for 8 games in a row.

---

## D. What to say and do if something goes wrong

| What happens | What to do | What to say |
| --- | --- | --- |
| A player's phone drops or dies | Nothing. The page reconnects by itself. If it does not, they open `http://10.42.0.1` and log in again with their Admission ID: same company, same role. | "Log in again with your Admission ID. Your seat is saved." |
| A player is absent, or must be replaced | Only in the 3-minute Briefing: **Replace player**. After the Briefing it is not possible; the company plays one short, and the CEO and CFO cover the role as well as they can. | "We are swapping a player now. Seats lock when the Briefing ends." |
| The Pi reboots mid-game | Wait about a minute. The game resumes from its last save (saved every 5 seconds, so up to about 5 seconds are lost) and the time that the Pi was off does not count. The organizer page reconnects by itself; if not, reload and log in. **TO VERIFY ON THE PI**: pull the power in a rehearsal and check this. | "The server restarted. Please wait one minute, then reload. Nothing is lost." |
| The Wi-Fi hotspot is down | Check the Pi has power and has had a minute. Try your own phone. If it is still down, power-cycle the Pi. Last resort: spare router (Section A; **TO VERIFY ON THE PI**) or the paper fallback. | "We are fixing the network. Please stay seated and keep your phones on." |
| A page looks stale or frozen | Reload the page (browser refresh). They stay logged in or log in again with the Admission ID. | "Pull down or press refresh." |
| The organizer browser crashes or closes | Open `/organizer.html` and log in again. The game is not affected. Downloads need a fresh login (the download pass is tied to the login), so log in again before downloading. | none |
| Wrong organizer password, locked out | After 5 wrong tries in a minute the page refuses even the right password for 60 seconds. Wait one minute, then type it slowly. | none |
| Database problem, or "Backup failed" in red | A failed backup does not stop the game; it tries again after 5 minutes. Check the USB stick is in and not full. For a real database problem after the game, follow [Restore from backup](restore-from-backup.md). Work after the last backup (up to 5 minutes) is lost. | "Short pause while I fix the server." |
| A hostile or rude player name appears | Names are shown as plain text and cannot break the page. If it is offensive, fix the name before the game: swap or replace the player in the Briefing. | none |
| Two organizers at once | Fine for watching. Only **one market event and one coin injection per game** can be used: the second attempt is refused ("already used"). Agree who presses what. | none |
| A company is out of coins | Approvals stop at a wallet of -200: the CFO can only reject anything that would go lower. Attacks can push the wallet below -200. Coins come back from selling and from the CFO's puzzles. Use the one coin injection if it is a glitch or a company is hopelessly behind. | "The CFO's puzzles and your sales earn coins back." |
| Red banner "the ... phase could not finish" | The server tried to move to the next phase and failed. Look at the server log (`journalctl -u showdown -n 50`). If the clock sits at 0:00 and nothing moves, try **skip to next phase** once (not possible out of the Competition). If the Competition is the stuck phase, do not wait: Reveal graphs, download, Next Game, and restore from backup afterward if needed. **TO VERIFY ON THE PI**: what a real stuck phase looks like cannot be made on demand. | "Small technical pause, please wait." |
| Players cannot find the page | Read the address from the sign: `http://10.42.0.1` (type it, no `https`), or scan the QR code on the sign. Make sure they stay on the Wi-Fi even if the phone says "no internet". | |
| Everything is lost | Run the game on paper: problem statements, role cards, and a manual coin count. | |

---

## E. After the event

- [ ] Before the last Next Game: download the **whole event (Excel)** and the last game's Excel and graph images (see Section C, step 7).
- [ ] Check you have 8 per-game Excel files and 24 graph images (3 per game). Open one file to make sure it is not empty.
- [ ] Copy the backups off the Pi: the whole `BACKUP_DIR` folder on the USB stick (newest 50 files are kept).
- [ ] Copy the database itself and the saved graph images from the Pi: `data/showdown.db` and `data/graphs/` under the install folder (default `/home/pi/showdown`). Stop the service first if you want a clean database copy: `sudo systemctl stop showdown`.
- [ ] Shut the Pi down properly: `sudo shutdown now`, wait until the green light stops flashing, then pull the power. Never just pull the plug.
- [ ] Put the finished event data somewhere safe (two copies). Wipe the database only when you are sure you have everything.

---

## F. Organizer card (print this page, keep it in your hand)

**Startup Showdown, the 10 things to remember**

1. **Password:** ______________________ (organizer). Console: `http://10.42.0.1/organizer.html`. Players: `http://10.42.0.1` (also at `/join`). Wrong password five times: wait 60 seconds.
2. **Roster:** ID, then name; comma, tab or semicolon. Fix rejected lines with **Add participant**.
3. **Seat everyone** with the company and role drop-downs. Five roles in each company. You choose the pairing.
4. **Start game** needs two clicks. Seats change **only in the 3-minute Briefing** (Swap seats, Replace player).
5. **Times:** Briefing 3, Ideation 3, Shop 7 (plus time saved by an early end), Summary 20 seconds, Competition 16 minutes.
6. **Competition:** one market event and one coin injection (1 to 500) per game. Watch the attack log. Do not say "attack" to players.
7. **Never use "skip to next phase"** at the event. It is for rehearsals (or recovering a stuck game).
8. **End of game:** Reveal graphs, then **download Excel and the three PNGs**, **then** Next Game. Next Game is the only end button. The download links go away after it.
9. **Problems:** phone drops: log in again. Pi reboots: wait one minute, it resumes. Page stale: reload. Backups go to the USB every 5 minutes: "Last backup ... ok". Red banner: red rehearsal banner means a rehearsal speed is on, "phase could not finish" means check the log.
10. **After:** download the whole-event Excel, copy the USB backups and `data/graphs`, `sudo shutdown now`.

---

## G. Where the product and the Master Guide differ (read once)

- **Login:** the guide says a participant enters their name and Admission ID. The product asks for the Admission ID only; the name comes from the roster. (Section 0.1)
- **Downloads "at any time":** the guide (Section 10) says the organizer can download per game and for the whole event at any time. In the product the links appear only for the running game, after the reveal, and disappear once you press Next Game. Download first. Also the whole-event Excel is only reachable that way: do it during the last game.
- **Next Game and Reveal:** the guide implies Reveal then Next Game. Pressing Next Game without Reveal also reveals the graphs (and ends the game). Best to Reveal first and download.
- **"End game":** the guide's module list (Section 7) still says "End game". It no longer exists; Next Game is the only end action.
- **Organizer overrides:** the guide (Section 6) says organizers can correct glitches and every manual change is logged. The product has only the one coin injection, seat changes in the Briefing, and the market event. There is no manual wallet edit.
- **Network:** the guide says there is no router. A spare router is only a plan B; the sign and the address (`10.42.0.1`) are for the Pi's own hotspot.
- **Pairing and time:** the guide's "30 minutes (hard stop)" is about 29 minutes plus the 20-second summary card, and the real gap between games (changeover) is on top of that.
- **Late arrivals after Start:** the guide's Section 0.1 allows adding someone to the roster at any time, but they can only be seated into a game during the Briefing (Replace player), and only if they are in the lobby.

---

## H. Last rehearsal result

(Paste the load test summary lines here after each rehearsal, with the date and the Pi's clock reading.)
