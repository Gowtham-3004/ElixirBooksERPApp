// Appearance preference. The resolved theme is stamped on <html data-theme="light|dark"> so every token
// in index.css (and the auth screens outside the shell) follows it. Light is the default; 'dark' and 'system'
// (which tracks prefers-color-scheme) are opt-in from the header / auth toggle or Setup › Preferences.
import { useSyncExternalStore } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';

const KEY = 'eb-theme';
const media = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);

// the resolved theme, for components that must branch on it (GIF vs SVG art) rather than just read tokens
let resolved: 'light' | 'dark' = 'light';
const subscribers = new Set<() => void>();

export function readTheme(): ThemePref {
  try { const v = localStorage.getItem(KEY); return v === 'dark' || v === 'light' || v === 'system' ? v : 'light'; } catch { return 'light'; }
}

export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  return pref === 'system' ? (media()?.matches ? 'dark' : 'light') : pref;
}

export function applyTheme(pref: ThemePref) {
  const next = resolveTheme(pref);
  const root = document.documentElement;
  root.dataset.theme = next;
  root.style.colorScheme = next;
  setResolved(next);
}

function setResolved(next: 'light' | 'dark') {
  if (next === resolved) return;
  resolved = next;
  subscribers.forEach((fn) => fn());
}

/** The theme currently applied to <html>; re-renders when the preference or the OS setting changes. */
export function useResolvedTheme(): 'light' | 'dark' {
  return useSyncExternalStore((cb) => { subscribers.add(cb); return () => { subscribers.delete(cb); }; }, () => resolved, () => 'light');
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
