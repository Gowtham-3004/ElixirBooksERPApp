// Appearance preference. The resolved theme is stamped on <html data-theme="light|dark"> so every token
// in index.css (and the auth screens outside the shell) follows it; 'system' tracks prefers-color-scheme.
export type ThemePref = 'light' | 'dark' | 'system';

const KEY = 'eb-theme';
const media = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);

export function readTheme(): ThemePref {
  try { const v = localStorage.getItem(KEY); return v === 'dark' || v === 'light' ? v : 'system'; } catch { return 'system'; }
}

export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  return pref === 'system' ? (media()?.matches ? 'dark' : 'light') : pref;
}

export function applyTheme(pref: ThemePref) {
  const resolved = resolveTheme(pref);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
}

export function setTheme(pref: ThemePref) {
  try { localStorage.setItem(KEY, pref); } catch { /* ignore */ }
  applyTheme(pref);
}

/** Apply once at startup and keep following the OS while the preference is 'system'. */
export function initTheme() {
  applyTheme(readTheme());
  media()?.addEventListener('change', () => { if (readTheme() === 'system') applyTheme('system'); });
}
