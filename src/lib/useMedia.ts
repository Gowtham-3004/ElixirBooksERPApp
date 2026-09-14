// Viewport breakpoints shared by the shell and layout composites. Keep in sync with the
// `@media` rules at the bottom of src/styles/ui.css.
import { useSyncExternalStore } from 'react';

export const BP = {
  /** phones and small tablets in portrait — off-canvas nav, single-column layouts */
  mobile: '(max-width: 767px)',
  /** anything narrower than a laptop — icon rail, two-column grids, stacked side rails */
  tablet: '(max-width: 1023px)',
  /** very narrow phones — KPI tiles go single column */
  narrow: '(max-width: 479px)',
} as const;

const queries = new Map<string, MediaQueryList>();
function mql(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || !window.matchMedia) return null;
  let m = queries.get(query);
  if (!m) { m = window.matchMedia(query); queries.set(query, m); }
  return m;
}

/** True while the viewport matches `query`; re-renders when it changes. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => { const m = mql(query); if (!m) return () => {}; m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => mql(query)?.matches ?? false,
    () => false,
  );
}

export const useIsMobile = () => useMediaQuery(BP.mobile);
export const useIsTablet = () => useMediaQuery(BP.tablet);
