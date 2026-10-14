// One server clock. now() = real time + offset, minus the time the organizer has paused the game.
// While paused, now() stands still, so every phase, timer and coin rate stops with it.
// After a restart, restore() continues the clock from the last saved heartbeat.
export function createClock({ real = Date.now } = {}) {
  let offset = 0;
  let pausedTotal = 0; // ms paused before the current pause
  let pauseStart = null; // raw time (before pauses are taken off) when the current pause began
  const raw = () => real() + offset;
  return {
    now: () => (pauseStart !== null ? pauseStart : raw()) - pausedTotal,
    setOffset(ms) { offset = ms; },
    offset: () => offset,
    paused: () => pauseStart !== null,
    pausedMs: () => pausedTotal,
    pause() { if (pauseStart === null) pauseStart = raw(); },
    resume() {
      if (pauseStart === null) return;
      pausedTotal += raw() - pauseStart;
      pauseStart = null;
    },
    // Continue from clock time `at`, with `pausedMs` of earlier pauses; `paused` says whether a pause was running.
    restore(at, pausedMs, paused) {
      pausedTotal = pausedMs;
      offset = at + pausedMs - real();
      pauseStart = paused ? raw() : null;
    },
  };
}

// A real-time source that runs `speed` times faster than real time from the moment it is made.
// Only for rehearsals: speed 10 plays a 30 minute game in 3 minutes. Pass it as createClock({ real }).
export function speedClock(speed = 1, realNow = Date.now) {
  const start = realNow();
  return () => start + (realNow() - start) * speed;
}
