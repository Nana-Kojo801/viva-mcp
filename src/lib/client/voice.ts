"use client";

// ---------- speech synthesis ----------

let chosenVoice: SpeechSynthesisVoice | null | undefined;

function pickVoice(): SpeechSynthesisVoice | null {
  if (chosenVoice !== undefined && chosenVoice !== null) return chosenVoice;
  const voices = window.speechSynthesis?.getVoices() ?? [];
  if (!voices.length) return null;
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  chosenVoice =
    en.find((v) => v.lang === "en-US" && v.localService) ??
    en.find((v) => v.lang === "en-US") ??
    en.find((v) => v.localService) ??
    en[0] ??
    null;
  return chosenVoice;
}

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export type SpeakHandle = { cancel: () => void; done: Promise<void> };

/**
 * Speak text. `onWord` gets the char index of each spoken word, from boundary events when the
 * voice supports them, otherwise from a time-based sweep.
 */
export function speak(text: string, onWord?: (charIndex: number) => void): SpeakHandle {
  if (!canSpeak() || !text) return { cancel() {}, done: Promise.resolve() };
  const synth = window.speechSynthesis;
  synth.cancel();

  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 1;
  const voice = pickVoice();
  if (voice) u.voice = voice;

  let sawBoundary = false;
  let sweep: number | undefined;
  let fallbackTimer: number | undefined;
  let finished = false;
  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));

  const finish = () => {
    if (finished) return;
    finished = true;
    window.clearTimeout(fallbackTimer);
    window.clearTimeout(sweep);
    window.clearTimeout(watchdog);
    resolveDone();
  };

  const startSweep = () => {
    const words = [...text.matchAll(/\S+/g)];
    let i = 0;
    const step = () => {
      if (finished || sawBoundary || i >= words.length) return;
      const w = words[i++];
      onWord?.(w.index ?? 0);
      // Roughly 165 words a minute, longer words take longer.
      sweep = window.setTimeout(step, 200 + w[0].length * 45);
    };
    step();
  };

  let started = false;
  u.onstart = () => {
    if (!onWord || started) return;
    started = true;
    window.clearTimeout(fallbackTimer);
    onWord(0);
    fallbackTimer = window.setTimeout(() => {
      if (!sawBoundary) startSweep();
    }, 400);
  };
  // If the engine never reports a start (no voices installed, some mobile browsers), sweep anyway.
  if (onWord) {
    fallbackTimer = window.setTimeout(() => {
      if (!started && !sawBoundary) {
        started = true;
        startSweep();
      }
    }, 1200);
  }
  u.onboundary = (e) => {
    if (e.name && e.name !== "word") return;
    sawBoundary = true;
    window.clearTimeout(sweep);
    onWord?.(e.charIndex);
  };
  u.onend = finish;
  u.onerror = finish;

  // Some mobile browsers never fire onend; never let the quiz hang on speech.
  const watchdog = window.setTimeout(finish, 2500 + text.length * 90);

  synth.speak(u);
  return {
    cancel() {
      synth.cancel();
      finish();
    },
    done,
  };
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.addEventListener?.("voiceschanged", () => {
    chosenVoice = undefined;
  });
}

// ---------- speech recognition ----------

type RecognitionCtor = new () => SpeechRecognitionLike;
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

export function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type ListenError = "not-allowed" | "no-speech" | "network" | "audio-capture" | "other";

export type ListenHandle = { stop: () => void; abort: () => void };

export function listen(handlers: {
  onTranscript: (text: string) => void;
  onEnd: (finalText: string) => void;
  onError: (err: ListenError) => void;
}): ListenHandle | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = "en-US";
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let text = "";
  let errored = false;
  rec.onresult = (e) => {
    // Rebuild from every result each time; Chrome on Android repeats earlier results otherwise.
    let t = "";
    for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
    text = t.trim();
    handlers.onTranscript(text);
  };
  rec.onerror = (e) => {
    if (e.error === "aborted") return;
    errored = true;
    const known: ListenError[] = ["not-allowed", "no-speech", "network", "audio-capture"];
    handlers.onError(
      e.error === "service-not-allowed" ? "not-allowed" : known.includes(e.error as ListenError) ? (e.error as ListenError) : "other",
    );
  };
  rec.onend = () => {
    if (!errored) handlers.onEnd(text);
  };
  rec.start();
  return { stop: () => rec.stop(), abort: () => rec.abort() };
}

// ---------- input level ----------

export type LevelMeter = { stop: () => void };

/** Calls onLevel with a 0..1 loudness value about 30 times a second. */
export async function startLevelMeter(onLevel: (level: number) => void): Promise<LevelMeter | null> {
  if (!navigator.mediaDevices?.getUserMedia) return null;
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    return null;
  }
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);
  let raf = 0;
  const tick = () => {
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += ((v - 128) / 128) ** 2;
    onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
    raf = requestAnimationFrame(tick);
  };
  tick();
  return {
    stop() {
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
      onLevel(0);
    },
  };
}

// ---------- voice commands ----------

export type Command = "skip" | "repeat" | "dont-know" | "stop" | "study-ahead" | null;

export function matchCommand(transcript: string): Command {
  const t = transcript.toLowerCase().replace(/[^a-z' ]/g, " ").replace(/\s+/g, " ").trim();
  if (/^(skip|skip (it|this|this one|that)|next( question| one)?|pass)$/.test(t)) return "skip";
  if (/^(repeat|repeat (it|that|the question)|say (it|that) again|again|what was the question)$/.test(t)) return "repeat";
  if (/^(i )?(don'?t|do not) know$|^no idea$|^i give up$/.test(t)) return "dont-know";
  if (/^(stop|stop (the )?quiz|end( quiz)?|quit|i'?m done|that'?s enough)$/.test(t)) return "stop";
  if (/^(study ahead|keep going|study anyway)$/.test(t)) return "study-ahead";
  return null;
}
