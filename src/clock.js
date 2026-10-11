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
