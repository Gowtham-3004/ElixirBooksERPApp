// Voice in / voice out for Lixi over the browser's Web Speech API. Recognition is Chromium/WebKit only
// (Firefox has none), so callers check `recognitionSupported()` and degrade to a disabled mic.

const Recognition = () => (typeof window === 'undefined' ? undefined : window.SpeechRecognition ?? window.webkitSpeechRecognition);

export const recognitionSupported = () => !!Recognition();
export const synthesisSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

export interface RecognitionHandlers {
  lang?: string;
  /** partial transcript while the user is still speaking */
  onInterim: (text: string) => void;
  /** a finished phrase */
  onFinal: (text: string) => void;
  onEnd?: () => void;
  onError?: (code: string) => void;
}

/** Starts listening; returns a stop() handle. Resolves nothing when unsupported (callers guard first). */
export function startRecognition({ lang, onInterim, onFinal, onEnd, onError }: RecognitionHandlers): { stop: () => void } {
  const Ctor = Recognition();
  if (!Ctor) { onError?.('unsupported'); return { stop: () => {} }; }
  const rec = new Ctor();
  rec.lang = lang ?? (typeof navigator !== 'undefined' ? navigator.language : 'en-IN');
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const text = r[0]?.transcript ?? '';
      if (r.isFinal) onFinal(text.trim()); else interim += text;
    }
    if (interim) onInterim(interim.trim());
  };
  rec.onerror = (e) => onError?.(e.error);
  rec.onend = () => onEnd?.();
  try { rec.start(); } catch (err) { onError?.((err as Error).name || 'start-failed'); }
  return { stop: () => { try { rec.stop(); } catch { /* already stopped */ } } };
}

export function speak(text: string) {
  if (!synthesisSupported()) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.02;
  u.pitch = 1;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (synthesisSupported()) window.speechSynthesis.cancel();
}
