// Hash-based navigation. Paths look like "sales/invoices/inv_0118?tab=accounting".
// Modules receive { sub, id, params } from the registry and render their own sub-routes.

import { useSyncExternalStore } from 'react';

export interface Route {
  path: string;
  /** first segment, e.g. "sales" */
  module: string;
  /** second segment, e.g. "invoices" */
  sub: string;
  /** third segment, e.g. record id */
  id: string;
  /** remaining segments after id */
  rest: string[];
  params: Record<string, string>;
}

function parse(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [pathPart, query = ''] = raw.split('?');
  const segs = pathPart.split('/').filter(Boolean);
  const params: Record<string, string> = {};
  query.split('&').filter(Boolean).forEach((kv) => {
    const [k, v = ''] = kv.split('=');
    params[decodeURIComponent(k)] = decodeURIComponent(v);
  });
  return {
    path: pathPart || 'home',
    module: segs[0] ?? 'home',
    sub: segs[1] ?? '',
    id: segs[2] ?? '',
    rest: segs.slice(3),
    params,
  };
}

let current: Route = parse(typeof window !== 'undefined' ? window.location.hash : '');
const listeners = new Set<() => void>();
const history: string[] = [];

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    current = parse(window.location.hash);
    listeners.forEach((l) => l());
  });
}

export const nav = {
  get: () => current,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** Navigate to a path like "sales/invoices" or "sales/invoices/<id>?tab=accounting". */
  go(path: string, params?: Record<string, string | number | undefined>) {
    let p = path.replace(/^#?\/?/, '');
    if (params) {
      const q = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');
      if (q) p += (p.includes('?') ? '&' : '?') + q;
    }
    if (current.path && current.path !== p.split('?')[0]) history.push(window.location.hash.replace(/^#\/?/, ''));
    window.location.hash = '#/' + p;
  },
  back(fallback = 'home') {
    const prev = history.pop();
    window.location.hash = '#/' + (prev ?? fallback);
  },
  replace(path: string) {
    const p = path.replace(/^#?\/?/, '');
    window.history.replaceState(null, '', '#/' + p);
    current = parse('#/' + p);
    listeners.forEach((l) => l());
  },
};

export function useRoute(): Route {
  return useSyncExternalStore(nav.subscribe, nav.get, nav.get);
}

/** Build a link to a document page: docLink('sales','invoices', id) → "sales/invoices/<id>" */
export function docLink(module: string, sub: string, id?: string, tab?: string): string {
  return `${module}/${sub}${id ? '/' + id : ''}${tab ? '?tab=' + tab : ''}`;
}
