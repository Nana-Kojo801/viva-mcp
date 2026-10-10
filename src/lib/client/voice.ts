"use client";

// ---------- speech output ----------
//
// Viva speaks with a natural cloud voice (Google Cloud TTS via /api/tts) played through Web Audio, so the
// reading line can follow the audio clock exactly. If that is unavailable, it uses the browser's own voice.

type CloudSpeech = { audio: string; wordTimes: number[] | null };

let audioCtx: AudioContext | null = null;
let cloudOff = false; // set when the server has no voice configured, so we stop asking
let cloudFailures = 0;
const speechCache = new Map<string, Promise<CloudSpeech | null>>();

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

/** Call inside a tap: mobile browsers only allow audio after a user gesture has started it. */
export function unlockAudio(): void {
  const c = ctx();
  if (c) {
    void c.resume();
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, 22050);
    src.connect(c.destination);
    src.start(0);
  }
  if (canSpeak()) {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  }
}

/** Release audio output while the mic is listening; some phones route the mic badly with output active. */
export function suspendAudio(): void {
  if (audioCtx?.state === "running") void audioCtx.suspend();
}

function fetchCloud(text: string): Promise<CloudSpeech | null> {
  if (cloudOff || !ctx()) return Promise.resolve(null);
  let p = speechCache.get(text);
  if (!p) {
    p = fetch(`/api/tts?text=${encodeURIComponent(text)}`)
      .then(async (res) => {
        if (res.status === 501 || res.status === 403) cloudOff = true;
        if (!res.ok) throw new Error(String(res.status));
        cloudFailures = 0;
        return (await res.json()) as CloudSpeech;
      })
      .catch(() => {
        speechCache.delete(text);
        if (++cloudFailures >= 3) cloudOff = true;
        return null;
      });
    speechCache.set(text, p);
    if (speechCache.size > 60) speechCache.delete(speechCache.keys().next().value!);
  }
  return p;
}

/** Start fetching audio for text that is about to be spoken. */
export function prefetchSpeech(text: string): void {
  if (text) void fetchCloud(text);
}

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export type SpeakHandle = { cancel: () => void; done: Promise<void> };

/** Speak text. `onWord` gets the char index of each word as it is spoken. */
export function speak(text: string, onWord?: (charIndex: number) => void): SpeakHandle {
  let cancelled = false;
  let inner: SpeakHandle | null = null;
  const done = (async () => {
    if (!text) return;
    const cloud = await fetchCloud(text);
    if (cancelled) return;
    if (cloud) {
      inner = await playCloud(text, cloud, onWord).catch(() => null);
      if (cancelled) inner?.cancel();
      if (inner) return inner.done;
    }
    if (cancelled) return;
    inner = speakWithBrowser(text, onWord);
    return inner.done;
  })();
  return {
    cancel() {
      cancelled = true;
      inner?.cancel();
      if (!inner && canSpeak()) window.speechSynthesis.cancel();
    },
    done,
  };
}

function wordStarts(text: string): number[] {
  return [...text.matchAll(/\S+/g)].map((m) => m.index ?? 0);
}

/** Estimated start time of each word when the voice gives no timings: by length, with pauses after punctuation. */
function estimateTimes(text: string, duration: number): number[] {
  const words = text.match(/\S+/g) ?? [];
  const weights = words.map((w) => w.length + 2 + (/[,;:]$/.test(w) ? 3 : /[.!?]$/.test(w) ? 5 : 0));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const speaking = duration * 0.94; // trailing silence
  let acc = 0;
  return weights.map((w) => {
    const t = (acc / total) * speaking;
    acc += w;
    return t;
  });
}

async function playCloud(text: string, speech: CloudSpeech, onWord?: (i: number) => void): Promise<SpeakHandle> {
  const c = ctx()!;
  if (c.state === "suspended") await c.resume();
  const bytes = Uint8Array.from(atob(speech.audio), (ch) => ch.charCodeAt(0));
  const buffer = await c.decodeAudioData(bytes.buffer);
  if (c.state !== "running") throw new Error("audio locked");

  const starts = wordStarts(text);
  const times = speech.wordTimes && speech.wordTimes.length === starts.length ? speech.wordTimes : estimateTimes(text, buffer.duration);

  const src = c.createBufferSource();
  src.buffer = buffer;
  src.connect(c.destination);
  const startAt = c.currentTime + 0.05;
  src.start(startAt);

  let raf = 0;
  let last = -1;
  const tick = () => {
    const t = c.currentTime - startAt;
    if (t >= 0) {
      let i = last < 0 ? 0 : last;
      while (i + 1 < times.length && times[i + 1] <= t) i++;
      if (i !== last) {
        last = i;
        onWord?.(starts[i]);
      }
    }
    raf = requestAnimationFrame(tick);
  };
  if (onWord) raf = requestAnimationFrame(tick);

  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));
  src.onended = () => {
    cancelAnimationFrame(raf);
    resolveDone();
  };
  return {
    cancel() {
      cancelAnimationFrame(raf);
      try {
        src.stop();
      } catch {}
      resolveDone();
    },
    done,
  };
}

// ---------- browser voice (fallback) ----------

let chosenVoice: SpeechSynthesisVoice | null | undefined;

function pickVoice(): SpeechSynthesisVoice | null {
  if (chosenVoice) return chosenVoice;
  const voices = window.speechSynthesis?.getVoices() ?? [];
  if (!voices.length) return null;
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  // Prefer the more natural-sounding voices when the platform offers them.
  const natural = /natural|neural|enhanced|premium|siri|samantha|google us english/i;
  chosenVoice =
    en.find((v) => v.lang === "en-US" && natural.test(v.name)) ??
    en.find((v) => v.lang === "en-US" && v.localService) ??
    en.find((v) => v.lang === "en-US") ??
    en[0] ??
    null;
  return chosenVoice;
}

function speakWithBrowser(text: string, onWord?: (charIndex: number) => void): SpeakHandle {
  if (!canSpeak()) return { cancel() {}, done: Promise.resolve() };
  const synth = window.speechSynthesis;
  synth.cancel();

  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 1;
  const voice = pickVoice();
  if (voice) u.voice = voice;

  let sawBoundary = false;
  let sweep: number | undefined;
  let sweepDelay: number | undefined;
  let finished = false;
  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));

  const finish = () => {
    if (finished) return;
    finished = true;
    window.clearTimeout(sweepDelay);
    window.clearTimeout(sweep);
    window.clearTimeout(watchdog);
    resolveDone();
  };

  // Without boundary events, follow an estimate. Only start once the engine reports it is speaking, and
  // a little late rather than early: a highlight that runs ahead of the voice reads as broken.
  const startSweep = () => {
    const words = [...text.matchAll(/\S+/g)];
    let i = 0;
    const step = () => {
      if (finished || sawBoundary || i >= words.length) return;
      const w = words[i++];
      onWord?.(w.index ?? 0);
      const pause = /[,;:]$/.test(w[0]) ? 180 : /[.!?]$/.test(w[0]) ? 320 : 0;
      sweep = window.setTimeout(step, 230 + w[0].length * 55 + pause);
    };
    step();
  };

  u.onstart = () => {
    if (!onWord) return;
    sweepDelay = window.setTimeout(() => {
      if (!sawBoundary) startSweep();
    }, 350);
  };
  u.onboundary = (e) => {
    if (e.name && e.name !== "word") return;
    sawBoundary = true;
    window.clearTimeout(sweep);
    onWord?.(e.charIndex);
  };
  u.onend = finish;
  u.onerror = finish;

  // Some mobile browsers never fire onend; never let the quiz hang on speech.
  const watchdog = window.setTimeout(finish, 3000 + text.length * 90);

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
  onsoundstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
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
  /** Rough loudness signal from recognition events, for devices where the level meter can't run. */
  onActivity?: (level: number) => void;
  /** `heard` is true when the browser detected speech, even if it produced no words. */
  onEnd: (finalText: string, heard: boolean) => void;
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
  let heard = false;
  rec.onsoundstart = () => handlers.onActivity?.(0.35);
  rec.onspeechstart = () => {
    heard = true;
    handlers.onActivity?.(0.6);
  };
  rec.onspeechend = () => handlers.onActivity?.(0.15);
  rec.onresult = (e) => {
    handlers.onActivity?.(0.8);
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
    if (!errored) handlers.onEnd(text, heard);
  };
  rec.start();
  return { stop: () => rec.stop(), abort: () => rec.abort() };
}

// ---------- input level ----------

/**
 * Phones generally can't share the microphone between getUserMedia and speech recognition: with the
 * level meter running, recognition hears silence. So the meter only runs on desktop.
 */
export function canMeterWhileListening(): boolean {
  if (typeof navigator === "undefined") return false;
  const uaData = (navigator as unknown as { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (uaData?.mobile) return false;
  return !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

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

export type Command = "skip" | "repeat" | "dont-know" | "stop" | "study-ahead" | "hint" | "explain" | "next" | null;

export function matchCommand(transcript: string): Command {
  const t = transcript.toLowerCase().replace(/[^a-z' ]/g, " ").replace(/\s+/g, " ").trim();
  if (/^(skip|skip (it|this|this one|that)|pass)$/.test(t)) return "skip";
  if (/^(next|next (question|one|card)|continue|go on|move on|okay next|ok next)$/.test(t)) return "next";
  if (/^((give me |can i (have|get) )?(a |another )?(hint|clue)( please)?|help( me)?|i need a hint)$/.test(t)) return "hint";
  if (/^(explain|explain (it|that|this)( again| differently| another way)?|explain again|(say|put) it (differently|another way)|i don'?t (get|understand) (it|that))$/.test(t)) return "explain";
  if (/^(repeat|repeat (it|that|the question)|say (it|that) again|again|what was the question)$/.test(t)) return "repeat";
  if (/^(i )?(don'?t|do not) know$|^no idea$|^i give up$/.test(t)) return "dont-know";
  if (/^(stop|stop (the )?quiz|end( quiz)?|quit|i'?m done|that'?s enough)$/.test(t)) return "stop";
  if (/^(study ahead|keep going|study anyway)$/.test(t)) return "study-ahead";
  return null;
}
