"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LineSkeleton, MarkingLine, QuestionSkeleton } from "./Loading";
import { Mark } from "./Mark";
import { Mic } from "./Mic";
import { ReadingLine } from "./ReadingLine";
import { callTool, ToolError, type Deck, type ListDecks, type NextCard, type SubmitAnswer } from "@/lib/client/mcp";
import {
  canMeterWhileListening,
  listen,
  matchCommand,
  recognitionCtor,
  speak,
  startLevelMeter,
  suspendAudio,
  unlockAudio,
  type LevelMeter,
  type ListenHandle,
  type SpeakHandle,
} from "@/lib/client/voice";

type Phase = "start" | "loading" | "asking" | "ready" | "listening" | "grading" | "feedback" | "caught-up" | "ended";

const ALL = "";

export function Quiz({ initialDeck }: { initialDeck?: string }) {
  const [phase, setPhase] = useState<Phase>("start");
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [deckId, setDeckId] = useState<string>(initialDeck ?? ALL);
  const [card, setCard] = useState<NextCard["card"]>(null);
  const [dueRemaining, setDueRemaining] = useState(0);
  const [charIndex, setCharIndex] = useState(-1);
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<SubmitAnswer | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [answered, setAnswered] = useState(0);
  const [level, setLevel] = useState(0);
  const [voiceIn, setVoiceIn] = useState(true);
  const [textMode, setTextMode] = useState(false);
  const [typed, setTyped] = useState("");

  const run = useRef(0); // bumps whenever a new flow starts, so stale async work can bail out
  const speech = useRef<SpeakHandle | null>(null);
  const rec = useRef<ListenHandle | null>(null);
  const meter = useRef<LevelMeter | null>(null);
  const meterOff = useRef(false);
  const exclude = useRef<string[]>([]);
  const cardRef = useRef(card);
  cardRef.current = card;
  const textInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const hasVoice = !!recognitionCtor();
    setVoiceIn(hasVoice);
    if (!hasVoice) setTextMode(true);
    callTool<ListDecks>("list_decks")
      .then((r) => {
        setDecks(r.decks);
        if (initialDeck && !r.decks.some((d) => d.id === initialDeck)) setDeckId(ALL);
      })
      .catch((e: unknown) => setNotice(e instanceof ToolError ? e.message : "Can't load your decks. Reload the page."));
    return () => {
      speech.current?.cancel();
      rec.current?.abort();
      meter.current?.stop();
    };
  }, [initialDeck]);

  const stopAudio = () => {
    speech.current?.cancel();
    rec.current?.abort();
    rec.current = null;
    meter.current?.stop();
    meter.current = null;
  };

  const say = useCallback((text: string, onWord?: (i: number) => void) => {
    speech.current?.cancel();
    const h = speak(text, onWord);
    speech.current = h;
    return h.done;
  }, []);

  const fail = useCallback(
    (e: unknown, back: Phase) => {
      const msg = e instanceof ToolError ? e.message : "Something went wrong. Try again.";
      setNotice(msg);
      if (e instanceof ToolError && e.code === "budget_exceeded") void say(msg);
      setPhase(back);
    },
    [say],
  );

  const ask = useCallback(
    async (c: NonNullable<NextCard["card"]>) => {
      const id = ++run.current;
      setPhase("asking");
      setCharIndex(-1);
      await say(c.front, (i) => run.current === id && setCharIndex(i));
      if (run.current !== id) return;
      setCharIndex(-1);
      setPhase("ready");
      if (textMode) textInput.current?.focus();
    },
    [say, textMode],
  );

  const nextQuestion = useCallback(
    async (ahead = false) => {
      const id = ++run.current;
      stopAudio();
      setPhase("loading");
      setResult(null);
      setTranscript("");
      setTyped("");
      setNotice(null);
      try {
        const r = await callTool<NextCard>("get_next_card", {
          ...(deckId ? { deck_id: deckId } : {}),
          ...(ahead ? { study_ahead: true } : {}),
          exclude_card_ids: exclude.current,
        });
        if (run.current !== id) return;
        setDueRemaining(r.due_remaining);
        if (!r.card) {
          setCard(null);
          setPhase("caught-up");
          setNotice(r.spoken);
          void say(r.spoken);
          return;
        }
        setCard(r.card);
        void ask(r.card);
      } catch (e) {
        if (run.current === id) fail(e, cardRef.current ? "ready" : "start");
      }
    },
    [deckId, ask, say, fail],
  );

  const submit = useCallback(
    async (answer: string) => {
      const c = cardRef.current;
      if (!c) return;
      const id = ++run.current;
      setPhase("grading");
      setNotice(null);
      try {
        const r = await callTool<SubmitAnswer>("submit_answer", { card_id: c.id, answer });
        if (run.current !== id) return;
        setResult(r);
        setAnswered((n) => n + 1);
        setPhase("feedback");
        await say(r.spoken);
        if (run.current !== id) return;
        await new Promise((res) => setTimeout(res, 900));
        if (run.current === id) void nextQuestion();
      } catch (e) {
        if (run.current === id) fail(e, "ready");
      }
    },
    [say, nextQuestion, fail],
  );

  const end = useCallback(() => {
    run.current++;
    stopAudio();
    setPhase("ended");
    setNotice(null);
    void say("Good session. See you next time.");
  }, [say]);

  /** Everything the user says or types goes through here: commands first, then answers. */
  const handleUtterance = useCallback(
    (text: string) => {
      const cmd = matchCommand(text);
      if (cmd === "stop") return end();
      if (phase === "caught-up" || !cardRef.current) {
        if (cmd === "study-ahead") return void nextQuestion(true);
        setNotice('Say "study ahead" to keep going, or "stop" to finish.');
        setPhase("caught-up");
        return;
      }
      if (cmd === "skip") {
        exclude.current = [...exclude.current, cardRef.current.id];
        return void nextQuestion();
      }
      if (cmd === "repeat") {
        setTranscript("");
        return void ask(cardRef.current);
      }
      void submit(text);
    },
    [phase, end, nextQuestion, ask, submit],
  );

  const startListening = useCallback(async () => {
    const id = ++run.current;
    speech.current?.cancel();
    suspendAudio();
    setCharIndex(-1);
    setTranscript("");
    setNotice(null);
    setResult((r) => (phase === "feedback" ? null : r));
    const backTo: Phase = cardRef.current ? "ready" : "caught-up";
    setPhase("listening");

    // On phones the meter would starve recognition of audio, so the mic breathes with recognition events instead.
    const useMeter = !meterOff.current && canMeterWhileListening();
    if (useMeter) meter.current = await startLevelMeter(setLevel);
    if (run.current !== id) return meter.current?.stop();
    const decay = useMeter ? undefined : window.setInterval(() => setLevel((l) => (l < 0.05 ? 0 : l * 0.85)), 90);
    const stopDecay = () => {
      window.clearInterval(decay);
      setLevel(0);
    };

    const begin = (retried: boolean) => {
      rec.current = listen({
        onTranscript: (t) => run.current === id && setTranscript(t),
        onActivity: useMeter ? undefined : (l) => run.current === id && setLevel((v) => Math.max(v, l)),
        onEnd: (t, heard) => {
          stopDecay();
          meter.current?.stop();
          meter.current = null;
          rec.current = null;
          if (run.current !== id) return;
          if (!t) {
            setNotice(
              heard
                ? "I heard you but couldn't make out the words. Tap the mic and try again, a little closer to the phone."
                : "I didn't hear anything. Tap the mic and answer again.",
            );
            setPhase(backTo);
            return;
          }
          handleUtterance(t);
        },
        onError: (err) => {
          stopDecay();
          meter.current?.stop();
          meter.current = null;
          rec.current = null;
          if (run.current !== id) return;
          if (err === "audio-capture" && !retried && !meterOff.current) {
            // Some phones can't share the mic between the level meter and recognition.
            meterOff.current = true;
            return begin(true);
          }
          setPhase(backTo);
          if (err === "not-allowed") {
            setTextMode(true);
            setNotice("Microphone access is blocked. Type your answers below, or allow the microphone in your browser settings.");
          } else if (err === "no-speech") {
            setNotice("I didn't hear anything. Tap the mic and answer again.");
          } else if (err === "network") {
            setNotice("Speech recognition needs a connection. Check it and tap the mic again.");
          } else if (err === "audio-capture") {
            setTextMode(true);
            setNotice("No microphone was found. Type your answer below.");
          } else {
            setNotice("Voice input stopped. Tap the mic to try again, or type your answer.");
          }
        },
      });
    };
    begin(false);
  }, [phase, handleUtterance]);

  const start = () => {
    // Starting audio inside the tap unlocks it on mobile browsers before the network round trip.
    unlockAudio();
    exclude.current = [];
    setAnswered(0);
    void nextQuestion();
  };

  const onMic = () => {
    if (phase === "start" || phase === "ended") return start();
    if (phase === "listening") return rec.current?.stop();
    if (!voiceIn) return textInput.current?.focus();
    void startListening();
  };

  const onType = (e: React.FormEvent) => {
    e.preventDefault();
    const t = typed.trim();
    if (!t) return;
    setTranscript(t);
    setTyped("");
    handleUtterance(t);
  };

  const busy = phase === "loading" || phase === "grading";
  const micLabel =
    phase === "start" || phase === "ended"
      ? "Start quiz"
      : phase === "listening"
        ? "Tap to stop"
        : phase === "grading"
          ? "Marking"
          : phase === "loading"
            ? "One moment"
            : "Tap to answer";

  const deckTitle = decks?.find((d) => d.id === deckId)?.title;
  const totalDue = decks?.reduce((n, d) => n + d.due_count, 0) ?? 0;
  const inSession = phase !== "start" && phase !== "ended";

  return (
    <div className="quiz">
      <header className="quiz-head">
        <span className="wordmark">Viva</span>
        <label className="deck-picker">
          <span className="visually-hidden">Deck</span>
          <select
            value={deckId}
            onChange={(e) => {
              setDeckId(e.target.value);
              exclude.current = [];
              if (inSession) {
                run.current++;
                stopAudio();
                setCard(null);
                setResult(null);
                setPhase("start");
              }
            }}
          >
            <option value={ALL}>All decks</option>
            {decks?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </label>
      </header>

      <section className="quiz-stage" aria-live="polite">
        {phase === "start" && (
          <div className="intro">
            <p className="intro-line">
              I&apos;ll ask a question out loud. Tap the mic and answer in your own words.
            </p>
            <p className="intro-meta">
              {decks == null ? (
                <LineSkeleton label="Loading your decks" width="13em" />
              ) : (
                `${deckTitle ?? "All decks"}: ${deckId ? (decks.find((d) => d.id === deckId)?.due_count ?? 0) : totalDue} cards due.`
              )}
            </p>
          </div>
        )}

        {phase === "ended" && (
          <div className="intro">
            <p className="intro-line">
              Session over. You answered {answered} {answered === 1 ? "question" : "questions"}.
            </p>
            <p className="intro-meta">
              <Link href="/progress">See your progress</Link>
            </p>
          </div>
        )}

        {phase === "loading" && <QuestionSkeleton label={answered ? "Finding your next question" : "Finding a question"} />}

        {card && inSession && phase !== "caught-up" && phase !== "loading" && (
          <>
            <p className="quiz-count">
              {answered} answered · {dueRemaining} due
            </p>
            <div className={`question-row${result ? " is-answered" : ""}`}>
              <ReadingLine text={card.front} charIndex={phase === "asking" ? charIndex : -1} />
              {result && <Mark key={card.id} verdict={result.verdict} />}
            </div>
            {transcript && <p className="transcript">{transcript}</p>}
            {phase === "grading" && <MarkingLine />}
            {result && (
              <div className="feedback">
                <p>{result.feedback}</p>
                {result.correct_answer && (
                  <p className="feedback-answer">
                    <span className="feedback-label">Answer: </span>
                    {result.correct_answer}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {notice && <p className="notice">{notice}</p>}

        {phase === "caught-up" && (
          <div className="row-actions">
            <button type="button" className="text-button" onClick={() => void nextQuestion(true)}>
              Study ahead
            </button>
            <Link className="text-button" href="/notes">
              Add notes
            </Link>
          </div>
        )}
      </section>

      <footer className="quiz-controls">
        {inSession && card && phase !== "caught-up" && (
          <div className="row-actions">
            <button type="button" className="text-button" onClick={() => handleUtterance("skip")} disabled={busy}>
              Skip
            </button>
            <button type="button" className="text-button" onClick={() => handleUtterance("repeat")} disabled={busy}>
              Repeat
            </button>
            <button type="button" className="text-button" onClick={() => handleUtterance("I don't know")} disabled={busy}>
              I don&apos;t know
            </button>
            <button type="button" className="text-button" onClick={end}>
              Stop
            </button>
          </div>
        )}

        {textMode && inSession && (
          <form className="type-answer" onSubmit={onType}>
            {!voiceIn && <p className="type-note">Voice input isn&apos;t available in this browser. Type your answers; questions are still read aloud.</p>}
            <label className="visually-hidden" htmlFor="typed">
              Your answer
            </label>
            <input
              id="typed"
              ref={textInput}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Type your answer"
              autoComplete="off"
              disabled={busy}
            />
            <button type="submit" disabled={busy || !typed.trim()}>
              Answer
            </button>
          </form>
        )}

        {(!textMode || !inSession || voiceIn) && (
          <Mic listening={phase === "listening"} busy={busy || (!voiceIn && inSession)} level={level} label={micLabel} onPress={onMic} />
        )}

        {voiceIn && inSession && (
          <button type="button" className="text-button switch-mode" onClick={() => setTextMode((t) => !t)}>
            {textMode ? "Hide typing" : "Type instead"}
          </button>
        )}
      </footer>
    </div>
  );
}
