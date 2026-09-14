// Per-browser UI preferences (appearance, density). A tiny external store so the shell — which stamps
// data-density on its root — and the Setup › User preferences page read and write the same value.
import { useSyncExternalStore } from 'react';
import { readTheme, setTheme, type ThemePref } from '../lib/theme';
import { readDecor, setDecor, type DecorPref } from '../lib/decor';

export type Density = 'comfortable' | 'compact';

export interface Prefs {
  density: Density;
  theme: ThemePref;
  /** decorative Storyset art (workspace watermark, auth backdrop scene, sidebar promo) */
  decor: DecorPref;
}

const DENSITY_KEY = 'eb-density';

function load(): Prefs {
  let density: Density = 'comfortable';
  try { if (localStorage.getItem(DENSITY_KEY) === 'compact') density = 'compact'; } catch { /* ignore */ }
  return { density, theme: readTheme(), decor: readDecor() };
}

let state: Prefs = load();
const listeners = new Set<() => void>();

function set(patch: Partial<Prefs>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const prefs = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  setDensity(density: Density) {
    try { localStorage.setItem(DENSITY_KEY, density); } catch { /* ignore */ }
    set({ density });
  },
  setTheme(theme: ThemePref) {
    setTheme(theme);
    set({ theme });
  },
  setDecor(decor: DecorPref) {
    setDecor(decor);
    set({ decor });
  },
};

export function usePrefs(): Prefs {
  return useSyncExternalStore(prefs.subscribe, prefs.get, prefs.get);
}
