// One server clock. now() = real time + offset. After a restart the offset is
// set so the clock continues from the last saved heartbeat.
export function createClock({ real = Date.now } = {}) {
  let offset = 0;
  return {
    now: () => real() + offset,
    setOffset(ms) { offset = ms; },
    offset: () => offset,
  };
}

// A real-time source that runs `speed` times faster than real time from the moment it is made.
// Only for rehearsals: speed 10 plays a 30 minute game in 3 minutes. Pass it as createClock({ real }).
export function speedClock(speed = 1, realNow = Date.now) {
  const start = realNow();
  return () => start + (realNow() - start) * speed;
}
