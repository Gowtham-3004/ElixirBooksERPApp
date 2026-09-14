// Lixi — the assistant side panel. Modeless (no scrim): it sits beside the page like a Codex/Claude
// panel, so the user can keep working while a reply comes back. Voice in via Web Speech recognition,
// optional voice out via speech synthesis. Replies come from lib/lixi.ts (a stub for now).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRoute, useSession } from '../../store';
import { lixi, useLixi, type LixiMessage } from '../../store/lixi';
import { suggestionsFor, type LixiContext } from '../../lib/lixi';
import { recognitionSupported, startRecognition, synthesisSupported } from '../../lib/speech';
import { moduleById } from '../../modules/registry';
import { MicIcon, MicOffIcon, SendIcon, Volume2Icon, VolumeXIcon, XIcon } from '../Icons';
import LixiMark from './LixiMark';

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export default function LixiPanel() {
  const st = useLixi();
  if (!st.open) return null;
  return <Panel key="lixi" thread={st.thread} pending={st.pending} speakOn={st.speak} />;
}

function Panel({ thread, pending, speakOn }: { thread: LixiMessage[]; pending: boolean; speakOn: boolean }) {
  const s = useSession();
  const route = useRoute();
  const [draft, setDraft] = useState(() => lixi.consumePrefill() ?? '');
  const [listening, setListening] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const threadEl = useRef<HTMLDivElement>(null);
  const rec = useRef<{ stop: () => void } | null>(null);
  // what was typed before the mic started — interim speech is appended after it, finals replace the interim
  const spoken = useRef({ base: '', final: '' });
  const canListen = recognitionSupported();
  const canSpeak = synthesisSupported();

  const ctx = useMemo<LixiContext>(() => ({
    path: route.path, module: route.module, moduleLabel: moduleById(route.module)?.label,
    company: s.company?.tradeName ?? s.company?.legalName, user: s.user?.name,
  }), [route.path, route.module, s.company, s.user]);
  const chips = useMemo(() => suggestionsFor(ctx), [ctx]);

  useEffect(() => { textarea.current?.focus(); }, []);
  useEffect(() => { threadEl.current?.scrollTo({ top: threadEl.current.scrollHeight }); }, [thread.length, pending]);
  useEffect(() => () => rec.current?.stop(), []);

  const grow = () => { const el = textarea.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(160, el.scrollHeight)}px`; };
  useEffect(grow, [draft]);

  const send = (text = draft) => {
    if (!text.trim() || pending) return;
    stopListening();
    void lixi.send(text, ctx);
    setDraft('');
    textarea.current?.focus();
  };

  const stopListening = () => { rec.current?.stop(); rec.current = null; setListening(false); };
  const startListening = () => {
    if (!canListen || listening) return;
    setNote(null);
    spoken.current = { base: draft.trim() ? `${draft.trim()} ` : '', final: '' };
    rec.current = startRecognition({
      onInterim: (t) => setDraft(`${spoken.current.base}${spoken.current.final}${t}`),
      onFinal: (t) => { spoken.current.final += `${t} `; setDraft(`${spoken.current.base}${spoken.current.final}`.trimEnd()); },
      onEnd: () => { rec.current = null; setListening(false); },
      onError: (code) => {
        setListening(false); rec.current = null;
        setNote(code === 'not-allowed' || code === 'service-not-allowed' ? 'Microphone access was blocked — allow it in the browser’s site settings.'
          : code === 'no-speech' ? 'I didn’t catch anything — try again.' : code === 'network' ? 'Voice recognition needs a network connection.' : null);
      },
    });
    setListening(true);
  };

  return (
    <aside className="lixi-panel" role="complementary" aria-label="Lixi assistant" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); lixi.close(); } }}>
      <div className="lixi-head">
        <LixiMark size={28} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="title">Lixi</div>
          <div className="sub">AI assistant · preview</div>
        </div>
        {canSpeak && (
          <button type="button" className="btn-icon" aria-pressed={speakOn} title={speakOn ? 'Stop reading replies aloud' : 'Read replies aloud'} onClick={() => lixi.setSpeak(!speakOn)} style={speakOn ? { color: 'var(--accent)' } : undefined}>
            {speakOn ? <Volume2Icon size={16} /> : <VolumeXIcon size={16} />}
          </button>
        )}
        <button type="button" className="btn-icon" aria-label="Close Lixi" title="Close (Esc)" onClick={() => lixi.close()}><XIcon size={16} /></button>
      </div>

      <div className="lixi-thread" ref={threadEl}>
        {thread.length === 0 && (
          <div className="lixi-welcome">
            <LixiMark size={96} animated />
            <h3>Hi{s.user ? `, ${s.user.name.split(' ')[0]}` : ''} — I’m Lixi</h3>
            <p>Ask me about your books, or tell me where to go. Tap the mic to talk instead of typing.</p>
          </div>
        )}
        {thread.map((m) => (
          <div key={m.id} className={`lixi-msg ${m.role}`}>
            {m.role === 'lixi' && <LixiMark size={20} className="avatar" />}
            <div>
              <div className="bubble">{m.text}</div>
              <div className="time" style={{ textAlign: m.role === 'user' ? 'right' : 'left' }}>{fmtTime(m.at)}</div>
            </div>
          </div>
        ))}
        {pending && (
          <div className="lixi-msg lixi" aria-live="polite" aria-label="Lixi is thinking">
            <LixiMark size={24} animated className="avatar" />
            <div className="bubble"><span className="lixi-typing"><i /><i /><i /></span></div>
          </div>
        )}
      </div>

      {!pending && (
        <div className="lixi-chips">
          {chips.map((c) => <button key={c} type="button" className="chip" onClick={() => send(c)}>{c}</button>)}
        </div>
      )}
      {note && <div className="lixi-note">{note}</div>}
      {listening && !note && <div className="lixi-note" style={{ color: 'var(--danger)' }}>Listening… tap the mic again to stop.</div>}

      <div className="lixi-composer">
        <button type="button" className={`btn-icon lixi-mic ${listening ? 'listening' : ''}`} disabled={!canListen} aria-pressed={listening}
          title={canListen ? (listening ? 'Stop listening' : 'Speak to Lixi') : 'Voice input isn’t supported in this browser'}
          onClick={() => (listening ? stopListening() : startListening())}>
          {canListen ? <MicIcon size={18} /> : <MicOffIcon size={18} />}
        </button>
        <textarea ref={textarea} rows={1} value={draft} placeholder="Ask Lixi anything…" aria-label="Message Lixi"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button type="button" className="btn-primary lixi-send" aria-label="Send" title="Send (Enter)" disabled={!draft.trim() || pending} onClick={() => send()}><SendIcon size={16} /></button>
      </div>
    </aside>
  );
}
