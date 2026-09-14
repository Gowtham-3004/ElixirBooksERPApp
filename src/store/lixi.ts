// Lixi panel state — open/closed, the conversation, and the read-aloud preference. External store
// (same shape as session) so the header button, command palette, panel and preferences page agree.
// The thread is kept per user in localStorage; `open` and `pending` are session-only.
import { useSyncExternalStore } from 'react';
import { session } from './session';
import { ask, type LixiContext } from '../lib/lixi';
import { speak, stopSpeaking } from '../lib/speech';

export interface LixiMessage { id: string; role: 'user' | 'lixi'; text: string; at: string }

export interface LixiState {
  open: boolean;
  thread: LixiMessage[];
  pending: boolean;
  speak: boolean;
  /** text to drop into the composer when the panel opens (from the palette) */
  prefill?: string;
}

const key = (userId?: string) => `eb-lixi:${userId ?? 'anon'}`;
const uid = () => Math.random().toString(36).slice(2, 10);

function load(userId?: string): Pick<LixiState, 'thread' | 'speak'> {
  try {
    const raw = localStorage.getItem(key(userId));
    if (raw) { const v = JSON.parse(raw); return { thread: Array.isArray(v.thread) ? v.thread : [], speak: !!v.speak }; }
  } catch { /* ignore */ }
  return { thread: [], speak: false };
}

let userId = session.get().userId;
let state: LixiState = { open: false, pending: false, prefill: undefined, ...load(userId) };
const listeners = new Set<() => void>();

function set(patch: Partial<LixiState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
function persist() {
  try { localStorage.setItem(key(userId), JSON.stringify({ thread: state.thread.slice(-200), speak: state.speak })); } catch { /* ignore */ }
}

// another user signs in → their own thread; sign-out → close the panel
session.subscribe(() => {
  const next = session.get().userId;
  if (next === userId) return;
  userId = next;
  stopSpeaking();
  set({ ...load(userId), open: next ? state.open : false, pending: false, prefill: undefined });
});

export const lixi = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  open(prefill?: string) { set({ open: true, prefill: prefill || undefined }); },
  close() { stopSpeaking(); set({ open: false, prefill: undefined }); },
  toggle() { if (state.open) lixi.close(); else lixi.open(); },
  consumePrefill() { const p = state.prefill; if (p !== undefined) set({ prefill: undefined }); return p; },
  setSpeak(v: boolean) { if (!v) stopSpeaking(); set({ speak: v }); persist(); },
  clear() { stopSpeaking(); set({ thread: [], pending: false }); persist(); },
  async send(text: string, ctx: LixiContext) {
    const clean = text.trim();
    if (!clean || state.pending) return;
    const now = new Date().toISOString();
    set({ thread: [...state.thread, { id: uid(), role: 'user', text: clean, at: now }], pending: true });
    persist();
    let reply: string;
    try { reply = await ask(clean, ctx); } catch { reply = 'Something went wrong on my side — please try that again.'; }
    set({ thread: [...state.thread, { id: uid(), role: 'lixi', text: reply, at: new Date().toISOString() }], pending: false });
    persist();
    if (state.speak) speak(reply);
  },
};

export function useLixi(): LixiState {
  return useSyncExternalStore(lixi.subscribe, lixi.get, lixi.get);
}
