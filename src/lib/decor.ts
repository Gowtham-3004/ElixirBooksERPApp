// Small per-browser preferences beside the theme: whether decorative art is drawn, and which sidebar promo
// cards were dismissed. Decor is stamped on <html data-decor> so the auth screens (outside the shell) follow it too.
export type DecorPref = 'on' | 'off';

const DECOR_KEY = 'eb-decor';
const PROMO_KEY = 'eb-promo';

export function readDecor(): DecorPref {
  try { return localStorage.getItem(DECOR_KEY) === 'off' ? 'off' : 'on'; } catch { return 'on'; }
}

export function applyDecor(pref: DecorPref) {
  document.documentElement.dataset.decor = pref;
}

export function setDecor(pref: DecorPref) {
  try { localStorage.setItem(DECOR_KEY, pref); } catch { /* ignore */ }
  applyDecor(pref);
}

export function initDecor() {
  applyDecor(readDecor());
}

export function readPromoDismissed(): string[] {
  try { const v = JSON.parse(localStorage.getItem(PROMO_KEY) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
}

export function dismissPromo(id: string) {
  try { localStorage.setItem(PROMO_KEY, JSON.stringify(Array.from(new Set([...readPromoDismissed(), id])))); } catch { /* ignore */ }
}
