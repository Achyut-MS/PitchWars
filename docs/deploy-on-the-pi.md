# Setting up the game on the Raspberry Pi

Plain steps for a fresh Raspberry Pi 5 (8 GB). Do all of this at home, with internet, **well before** the event. The Pi will make its own Wi-Fi network; players type `http://10.42.0.1` into their phones.

Copy and paste the commands exactly. Lines starting with `#` are notes, not commands.

## 1. Put the operating system on the SD card

1. On a laptop, install **Raspberry Pi Imager** (raspberrypi.com/software).
2. Choose the device **Raspberry Pi 5**, the OS **Raspberry Pi OS (64-bit)** (the Bookworm release), and your SD card.
3. Click **Edit settings** (the gear) before writing:
   - Hostname: `showdown`
   - Username and password: pick your own (for example `organizer`). Write the password down.
   - Wi-Fi: enter your **home** Wi-Fi name, password and country (this is only so the Pi has internet during setup).
   - Services: turn on **SSH** with password login.
4. Write the card, put it in the Pi, plug in power and wait two minutes.

## 2. Log in and update

From your laptop (on the same home Wi-Fi):

```
ssh organizer@showdown.local
sudo apt update && sudo apt full-upgrade -y
sudo reboot
```

Wait a minute, log in again. (If `showdown.local` does not work, find the Pi's address in your router's list of devices.)

## 3. Install Node.js 22

The game needs Node 22 or newer. The Pi's normal package is older, so use NodeSource:

```
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git
node --version
```

The last line must print `v22` or higher.

## 4. Get the game

```
cd ~
git clone https://github.com/Achyut-MS/PitchWars.git
cd PitchWars
```

## 5. Run the installer

First look at what it will do (this changes nothing):

```
bash deploy/install.sh --dry-run
```

Then install for real, with a Wi-Fi password for the join sign (8 to 63 characters):

```
sudo WIFI_SSID=Showdown WIFI_PASSWORD='choose-a-wifi-password' bash deploy/install.sh
```

- It asks for the **organizer password** (at least 8 characters). Press Enter to let it make one; it shows a generated password **once**, so write it down.
- It downloads the game's parts (this is why the Pi needs internet now) and starts the game. It will start by itself every time the Pi has power.
- The settings (including the organizer password) are saved in `/etc/showdown/showdown.env`, readable only by the administrator. To change the password later, run the installer again with `ORGANIZER_PASSWORD='new-password'` in front of `bash`.

Check it:

```
bash deploy/check.sh
```

You want `[ OK ]` on the service and on `/` and `/join`. The hotspot line will fail until the next step.

## 6. Turn on the Pi's own Wi-Fi (do this last)

This takes over the Pi's Wi-Fi, so your home Wi-Fi link (and SSH over it) will drop. Connect a network cable to the Pi first if you want to keep working, or plan to reconnect another way.

```
sudo WIFI_PASSWORD='choose-a-wifi-password' COUNTRY=IN bash deploy/setup-hotspot.sh
```

Use the **same** password as in step 5 (the sign shows it). Change `IN` to your country code. It is safe to run again; it updates the same network.

## 7. Set the date and time

The Pi has no clock battery. Without internet at the event it forgets the date when unplugged, and backups and results will carry the wrong time. Before every event:

```
sudo date -s '2026-10-24 09:00:00'
```

(Use the real date and time.) Run `bash deploy/check.sh` any time to see the date it believes.

## 8. Set up the USB stick for backups

The game copies its database to a USB stick every 5 minutes during a game.

1. Format a stick (FAT32 or ext4) and name it `SHOWDOWN`.
2. Plug it into the Pi. The desktop version mounts it at `/media/<your-username>/SHOWDOWN`. Check with `ls /media/*/SHOWDOWN`.
3. If the folder exists, the installer already points backups there. If you plugged the stick in later, edit the setting: `sudo nano /etc/showdown/showdown.env`, set `BACKUP_DIR=/media/<your-username>/SHOWDOWN`, save (Ctrl+O, Enter, Ctrl+X), then `sudo systemctl restart showdown`.
4. In the organizer screen, "Last backup ..., ok" shows it works. Bring the stick home after each event.

## 9. Start and check with a phone

The game is already running. Reboot to be sure it starts by itself:

```
sudo reboot
```

After about a minute, on a phone: join the Wi-Fi **Showdown**, open `http://10.42.0.1/` (the sign-in screen appears) and `http://10.42.0.1/join` (the printable sign with QR codes). Print that sign for the room. If a phone says "no internet", that is normal; stay connected.

## If the Wi-Fi hotspot does not appear

1. `bash deploy/check.sh`. Is the hotspot line failing?
2. `sudo nmcli connection up showdown-hotspot` and read the message.
3. `sudo rfkill unblock wifi`, make sure the country was set (re-run step 6 with `COUNTRY=...`), then try again.
4. Run step 6 again; it is safe.
5. Last resort: connect a network cable and a laptop to the same switch, and use the Pi's address on that cable. Players cannot join without Wi-Fi, so also test a spare phone hotspot plan.
6. To see why: `sudo journalctl -u NetworkManager -n 50`.

If the game itself is down: `sudo systemctl status showdown`, then `sudo journalctl -u showdown -n 50`. `sudo systemctl restart showdown` fixes most things; a running game resumes where it was.

## Restoring from a backup

See `docs/restore-from-backup.md`. In short: stop the service (`sudo systemctl stop showdown`), copy the newest `showdown-*.db` from the USB stick over `data/showdown.db` in the game folder, delete the `.db-wal` and `.db-shm` files beside it, start the service. At most 5 minutes of play is lost.

## Updating the code between games (without losing the database)

The database lives in `~/PitchWars/data/` and is not part of the code, so updating never touches it. Still, take a copy first:

```
cd ~/PitchWars
cp data/showdown.db ~/showdown-before-update.db
git pull
npm ci --omit=dev
sudo systemctl restart showdown
bash deploy/check.sh
```

Never update during a game. Do it at home, with internet, and test with a phone before the event. If the installer's unit template changed, re-run `sudo bash deploy/install.sh` (it keeps your existing settings and password unless you set `ORGANIZER_PASSWORD`).

## Removing it

`sudo bash deploy/uninstall.sh` removes the service but never the database or backups. Add `--remove-settings` to delete the saved password and `--remove-hotspot` to delete the Wi-Fi network.
