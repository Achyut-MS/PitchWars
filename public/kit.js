// Shared markup pieces for the design (Plan 7). Pure functions: no DOM, tested in Node.
// Nothing here takes player text. Every input is checked against a fixed list, so nothing needs escaping.
export const ROLES = ['CEO', 'CTO', 'CFO', 'CMO', 'COO'];
export const PHASES = ['briefing', 'ideation', 'shop', 'summary', 'competition', 'ended'];
export const ROLE_ICON = { CEO: 'i-crown', CTO: 'i-chip', CFO: 'i-coins', CMO: 'i-mega', COO: 'i-gear' };
export const ROLE_TITLE = { CEO: 'Chief Executive Officer', CTO: 'Chief Technology Officer', CFO: 'Chief Financial Officer', CMO: 'Chief Marketing Officer', COO: 'Chief Operating Officer' };
const ICON_ID = /^i-[a-z0-9-]+$/;
const cleanClass = (c) => String(c).replace(/[^\w -]/g, '');

// <svg><use></svg> from the sprite. Lower-case tags and plain attributes only: the Plan 2 safety test strips tags with a strict pattern.
export function icon(id, cls = 'i') {
  if (!ICON_ID.test(id)) return '';
  return `<svg class="${cleanClass(cls)}" aria-hidden="true" focusable="false"><use href="/img/icons.svg#${id}"></use></svg>`;
}

// The only company letters, roles and phases that may reach the markup. Anything else gives ''.
export const companyOf = (c) => (c === 'A' || c === 'B' ? c : '');
export const roleOf = (r) => (ROLES.includes(r) ? r : '');
export const phaseOf = (p) => (PHASES.includes(p) ? p : '');

// data-company drives the theme (tokens.css). On player screens it is ALWAYS the viewer's own company.
export const companyAttr = (c) => (companyOf(c) ? ` data-company="${companyOf(c)}"` : '');
export const companyMark = (c) => icon(companyOf(c) === 'B' ? 'i-mark-b' : 'i-mark-a', 'mark');

// The logo slot. The picture is the --logo token in tokens.css (public/img/logo.svg). Not an <img>: see the Plan 2 safety test.
export const logo = (cls = 'logo') => `<span class="${cleanClass(cls)}" role="img" aria-label="Makerspace logo"></span>`;

// The five role chips of the drafts' header, the viewer's own one highlighted.
export function roleChips(mine) {
  return `<span class="roles">${ROLES.map((r) => `<span class="${r === mine ? 'on' : ''}" title="${r}">${icon(ROLE_ICON[r])}<span class="sr-only">${r}${r === mine ? ' (you)' : ''}</span></span>`).join('')}</span>`;
}
