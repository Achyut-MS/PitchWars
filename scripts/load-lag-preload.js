// Preloaded into the server child process by load-test.js (node --import). Samples event-loop delay
// and writes it to LOAD_LAG_FILE once a second; SIGUSR2 resets the histogram (start of the measured window).
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';

const RES = 10;
const h = monitorEventLoopDelay({ resolution: RES });
h.enable();
const ms = (ns) => Math.max(0, ns / 1e6 - RES); // the histogram includes the sampling interval itself
const out = process.env.LOAD_LAG_FILE;
process.on('SIGUSR2', () => h.reset());
if (out) {
  setInterval(() => {
    try { writeFileSync(out, JSON.stringify({ p50: ms(h.percentile(50)), p99: ms(h.percentile(99)), max: ms(h.max) })); } catch { /* ignore */ }
  }, 1000).unref();
}
