const BASE = [
  ['briefing', 180],
  ['ideation', 180],
  ['shop', 420],
  ['summary', 20],
  ['competition', 960],
];

export function timeline(game) {
  const saved = game.ideationSavedSec || 0;
  return BASE.map(([name, sec]) => [
    name,
    name === 'ideation' ? sec - saved : name === 'shop' ? sec + saved : sec,
  ]);
}

export function phaseAt(game, nowMs) {
  let t = Math.max(0, (nowMs - game.startedAt) / 1000);
  for (const [name, sec] of timeline(game)) {
    if (t < sec) return { phase: name, remainingSec: Math.ceil(sec - t) };
    t -= sec;
  }
  return { phase: 'ended', remainingSec: 0 };
}

export function endIdeationEarly(game, nowMs) {
  const p = phaseAt(game, nowMs);
  if (p.phase !== 'ideation') throw new Error('not in ideation');
  return { ...game, ideationSavedSec: (game.ideationSavedSec || 0) + p.remainingSec };
}
