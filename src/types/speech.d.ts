// Minimal Web Speech API typings — lib.dom has SpeechSynthesis but not SpeechRecognition
// (still vendor-prefixed in Chromium/WebKit). Only what lib/speech.ts touches.

interface SpeechRecognitionAlternativeLike { transcript: string; confidence: number }
interface SpeechRecognitionResultLike { readonly isFinal: boolean; readonly length: number; [index: number]: SpeechRecognitionAlternativeLike }
interface SpeechRecognitionEventLike extends Event { readonly resultIndex: number; readonly results: { readonly length: number; [index: number]: SpeechRecognitionResultLike } }
interface SpeechRecognitionErrorEventLike extends Event { readonly error: string; readonly message: string }

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface Window {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
}
