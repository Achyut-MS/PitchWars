# Restoring the database from a backup

The server copies the database to the folder named by the `BACKUP_DIR` environment variable (default `backups`; on the Pi, the USB stick, for example `/media/pi/SHOWDOWN`) every 5 minutes while a game runs and once after each Next Game. Files are named `showdown-<during|after|manual>-<time>.db`; the newest 50 are kept. The organizer console shows "Last backup 09:35, ok" or, in red, "Backup failed: ...". A failed backup never stops the game; the next 5-minute tick tries again.

`BACKUP_DIR` is read from the environment only (never from a browser). Optional: `BACKUP_EVERY_MS` changes the period for testing.

To restore (the live database is `data/showdown.db`, or whatever `DB_FILE` says):

1. Stop the service: `sudo systemctl stop showdown` (or stop `node src/index.js`).
2. Find the newest backup: `ls -t "$BACKUP_DIR"/showdown-*.db | head -1`.
3. Keep the broken files, just in case: `mv data/showdown.db data/showdown.db.broken`.
4. Remove the old journal files: `rm -f data/showdown.db-wal data/showdown.db-shm`.
5. Copy the backup in: `cp "$(ls -t "$BACKUP_DIR"/showdown-*.db | head -1)" data/showdown.db`.
6. Optionally check it: `sqlite3 data/showdown.db 'PRAGMA integrity_check; SELECT COUNT(*) FROM events;'` (should print `ok`).
7. Start the service: `sudo systemctl start showdown`. A running game resumes where the backup was taken.

Work done after the backup (at most 5 minutes) is lost.
