// Pure statistics helpers for the load test (unit-tested in test/load-stats.test.js).

// Nearest-rank percentile of an ascending list.
export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

export function summarize(values) {
  const s = [...values].sort((a, b) => a - b);
  const mean = s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0;
  return { count: s.length, mean, p50: percentile(s, 50), p95: percentile(s, 95), p99: percentile(s, 99), max: s.length ? s[s.length - 1] : 0 };
}

export const gapsOf = (stamps) => stamps.slice(1).map((t, i) => t - stamps[i]);
export const jitterOf = (gaps, expected) => gaps.map((g) => Math.abs(g - expected));

// measured: { jitterP99, pushP95, errors, dropped, rssGrowthMb|null, lagP99|null, reconnectMs|null }
// limits:   { jitterP99, pushP95, rssGrowthMb, lagP99, reconnectMs }. A null measurement is skipped, not failed.
export function evaluate(m, lim) {
  const upper = (name, value, limit, unit) => (value == null
    ? { name, value: 'n/a', limit: `< ${limit} ${unit}`, pass: true, skipped: true }
    : { name, value: `${Math.round(value * 10) / 10} ${unit}`, limit: `< ${limit} ${unit}`, pass: value < limit });
  const rows = [
    upper('tick jitter p99', m.jitterP99, lim.jitterP99, 'ms'),
    upper('push latency p95', m.pushP95, lim.pushP95, 'ms'),
    { name: 'errors', value: String(m.errors), limit: '0', pass: m.errors === 0 },
    { name: 'dropped messages', value: String(m.dropped), limit: '0', pass: m.dropped === 0 },
    upper('server memory growth', m.rssGrowthMb, lim.rssGrowthMb, 'MB'),
    upper('server event-loop lag p99', m.lagP99, lim.lagP99, 'ms'),
    upper('reconnect storm recovery', m.reconnectMs, lim.reconnectMs, 'ms'),
  ];
  return { ok: rows.every((r) => r.pass), rows };
}

export function fmtTable(rows) {
  const w = [];
  for (const r of rows) r.forEach((c, i) => { w[i] = Math.max(w[i] || 0, String(c).length); });
  return rows.map((r) => r.map((c, i) => (i === r.length - 1 ? String(c) : String(c).padEnd(w[i] + 2))).join('')).join('\n');
}
