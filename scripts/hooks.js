// The "hooks" in a piece of markup: every id, class, data-* attribute, data-send message shape and form field name.
// app.js, organizer.js and the tests of Plans 2 to 5 depend on these, so the redesign may add hooks but never drop one.
export function hooksOf(html) {
  const out = new Set();
  for (const [, id] of html.matchAll(/\sid="([^"]+)"/g)) out.add(`#${id}`);
  for (const [, cls] of html.matchAll(/\sclass="([^"]*)"/g)) for (const c of cls.split(/\s+/).filter(Boolean)) out.add(`.${c}`);
  // data-* values are kept when they are words (data-confirm="end_game"), dropped when they are per-row ids.
  for (const [, name, val] of html.matchAll(/\s(data-(?!send)[\w-]+)(?:="([^"]*)")?/g)) {
    out.add(`[${name}${val !== undefined && /^[a-z_]+$/.test(val) ? `=${val}` : ''}]`);
  }
  for (const [, json] of html.matchAll(/data-send='([^']*)'/g)) {
    const m = JSON.parse(json.replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
    out.add(`send:${m.type}(${Object.keys(m).filter((k) => k !== 'type').sort().join(',')})`);
  }
  for (const [, tag, name] of html.matchAll(/<(input|select|textarea)\b[^>]*\sname="([^"]+)"/g)) out.add(`${tag}[name=${name}]`);
  return [...out].sort();
}
