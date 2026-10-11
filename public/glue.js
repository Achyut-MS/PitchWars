// Small pure helpers for the browser glue (tested in Node).
const MESSAGES = {
  bad_password: 'Wrong password',
  too_many_attempts: 'Too many tries, wait a minute',
  unknown_id: 'That ID is not on the list',
  bad_message: 'Something went wrong. Please try again',
};

export function humanError(e) {
  if (typeof e !== 'string' || !e) return 'Something went wrong. Please try again';
  return Object.hasOwn(MESSAGES, e) ? MESSAGES[e] : e;
}

// Stable serialization (sorted keys) of a view without the ticking clock seconds.
export function viewKey(view) {
  const walk = (x, top) => {
    if (Array.isArray(x)) return x.map((y) => walk(y, false));
    if (x && typeof x === 'object') {
      const o = {};
      for (const k of Object.keys(x).sort()) {
        if (top && k === 'clock' && x[k] && typeof x[k] === 'object') { const { remainingSec, ...rest } = x[k]; o[k] = walk(rest, false); } else o[k] = walk(x[k], false);
      }
      return o;
    }
    return x;
  };
  return JSON.stringify(walk(view, true));
}

// Stops double clicks: after one send, nothing else is sent for windowMs or until the next state
// (release), and the same message is never sent twice within windowMs.
export function createSendGuard(windowMs = 600) {
  let lockedUntil = -Infinity;
  let lastText = null;
  let lastAt = -Infinity;
  return {
    allow(text, now) {
      if (now < lockedUntil) return false;
      if (text === lastText && now - lastAt < windowMs) return false;
      lockedUntil = now + windowMs;
      lastText = text;
      lastAt = now;
      return true;
    },
    release() { lockedUntil = -Infinity; },
  };
}

export function redrawDecision({ changed, pointerDown, downAt = 0, now, maxDeferMs = 400 }) {
  if (!changed) return { action: 'skip', wait: 0 };
  if (pointerDown && now - downAt < maxDeferMs) return { action: 'defer', wait: downAt + maxDeferMs - now };
  return { action: 'draw', wait: 0 };
}
