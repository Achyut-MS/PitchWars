// WCAG contrast and a small reader for public/css/tokens.css. Used by test/tokens.test.js and visual/checks.js.
export function luminance(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// The custom properties of :root, [data-company="A"] and [data-company="B"], with var(--x) references resolved.
export function readTokens(css) {
  const block = (sel) => {
    const m = css.match(new RegExp(`${sel.replace(/[[\]"=]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
    if (!m) throw new Error(`no ${sel} block in tokens.css`);
    return Object.fromEntries([...m[1].replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
  };
  const root = block(':root');
  const resolve = (set) => {
    const out = { ...set };
    for (let n = 0; n < 5; n++) for (const k of Object.keys(out)) out[k] = out[k].replace(/var\(--([\w-]+)\)/g, (_, r) => out[r] ?? root[r] ?? `var(--${r})`);
    return out;
  };
  return { root: resolve(root), A: resolve({ ...root, ...block('[data-company="A"]') }), B: resolve({ ...root, ...block('[data-company="B"]') }) };
}
