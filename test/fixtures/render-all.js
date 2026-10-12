import { renderLogin, renderScreen } from '../../public/render.js';
import { renderOrganizer, renderOrganizerLogin } from '../../public/render-organizer.js';
import { PLAYER, ORGANIZER } from './views.js';

// Every fixture rendered to HTML, keyed by name. Organizer fixtures get the ui states that change markup.
export function renderAll() {
  const out = { login: renderLogin(''), 'login-error': renderLogin('That ID is not on the list.'), 'org-login': renderOrganizerLogin('Wrong password.') };
  for (const [k, v] of Object.entries(PLAYER)) out[k] = renderScreen(v);
  for (const [k, v] of Object.entries(ORGANIZER)) out[k] = renderOrganizer(v, {});
  out['org-lobby-import'] = renderOrganizer(ORGANIZER['org-lobby'], { importResult: { added: 12, skipped: 0, rejected: [{ line: 14, reason: 'blank admission id' }] } });
  out['org-confirm'] = renderOrganizer(ORGANIZER['org-running'], { confirm: 'end_game' });
  out['org-offline'] = renderOrganizer(ORGANIZER['org-running'], { offline: true });
  return out;
}
