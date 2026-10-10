"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CountUp, MiniMark, Tally } from "./Bits";
import { CalendarIcon, ExplainIcon, HintIcon, KeyboardIcon, NextIcon, RepeatIcon, ShrugIcon, SkipIcon, StopIcon } from "./Icons";
import { LineSkeleton, MarkingLine, QuestionSkeleton } from "./Loading";
import { Mark } from "./Mark";
import { Mic } from "./Mic";
import { ReadingLine } from "./ReadingLine";
import { examLabel } from "@/lib/dates";
import {
  callTool,
  ToolError,
  type Deck,
  type Explain,
  type Hint,
  type ListDecks,
  type NextCard,
  type Nudge,
  type SubmitAnswer,
  type Verdict,
} from "@/lib/client/mcp";
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

type Phase =
  | "start"
  | "loading"
  | "asking"
  | "ready"
  | "listening"
  | "hinting"
  | "grading"
  | "feedback"
  | "explaining"
  | "explained"
  | "caught-up"
  | "ended";

type SessionMark = { verdict: Verdict; topic: string };

const ALL = "";
const AUTO_NEXT_CORRECT = 1800;
const AUTO_NEXT_MISSED = 5000;
const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function Quiz({ initialDeck }: { initialDeck?: string }) {
  const [phase, setPhase] = useState<Phase>("start");
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [deckId, setDeckId] = useState<string>(initialDeck ?? ALL);
  const [nudge, setNudge] = useState<Nudge | null>(null);
  const [card, setCard] = useState<NextCard["card"]>(null);
  const [reason, setReason] = useState<NextCard["reason"]>(null);
  const [dueRemaining, setDueRemaining] = useState(0);
  const [charIndex, setCharIndex] = useState(-1);
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<SubmitAnswer | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [explain, setExplain] = useState<Explain | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [session, setSession] = useState<SessionMark[]>([]);
  const [level, setLevel] = useState(0);
  const [voiceIn, setVoiceIn] = useState(true);
  const [textMode, setTextMode] = useState(false);
  const [typed, setTyped] = useState("");
  const [autoNext, setAutoNext] = useState<{ ms: number; key: number } | null>(null);

  const run = useRef(0); // bumps whenever a new flow starts, so stale async work can bail out
  const speech = useRef<SpeakHandle | null>(null);
  const rec = useRef<ListenHandle | null>(null);
  const meter = useRef<LevelMeter | null>(null);
  const meterOff = useRef(false);
  const autoTimer = useRef<number | undefined>(undefined);
  const exclude = useRef<string[]>([]);
  const nudgeSpoken = useRef(false);
  const textInput = useRef<HTMLInputElement>(null);
  // Mirrors of state that async callbacks read, so they never see a stale render.
  const cardRef = useRef(card);
  cardRef.current = card;
  const resultRef = useRef(result);
  resultRef.current = result;
  const hintsRef = useRef(hints);
  hintsRef.current = hints;
  const explainRef = useRef(explain);
  explainRef.current = explain;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const stageEnd = useRef<HTMLDivElement>(null);

  // Keep the newest hint, feedback or explanation in view above the controls.
  useEffect(() => {
    if (hints.length || result || explain) stageEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [hints.length, result, explain]);

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
      window.clearTimeout(autoTimer.current);
      speech.current?.cancel();
      rec.current?.abort();
      meter.current?.stop();
    };
  }, [initialDeck]);

  useEffect(() => {
    setNudge(null);
    callTool<Nudge>("get_study_nudge", { timezone: timezone(), ...(deckId ? { deck_id: deckId } : {}) })
      .then(setNudge)
      .catch(() => setNudge(null));
  }, [deckId]);

  const clearAuto = () => {
    window.clearTimeout(autoTimer.current);
    setAutoNext(null);
  };

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
    async (ahead = false, preface?: string) => {
      const id = ++run.current;
      clearAuto();
      stopAudio();
      setPhase("loading");
      setResult(null);
      setHints([]);
      setExplain(null);
      setTranscript("");
      setTyped("");
      setNotice(null);
      const spoken = preface ? say(preface) : Promise.resolve();
      try {
        const r = await callTool<NextCard>("get_next_card", {
          ...(deckId ? { deck_id: deckId } : {}),
          ...(ahead ? { study_ahead: true } : {}),
          exclude_card_ids: exclude.current,
        });
        await spoken;
        if (run.current !== id) return;
        setDueRemaining(r.due_remaining);
        setReason(r.reason);
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

  const scheduleNext = useCallback(
    (ms: number) => {
      window.clearTimeout(autoTimer.current);
      setAutoNext({ ms, key: Date.now() });
      autoTimer.current = window.setTimeout(() => {
        setAutoNext(null);
        void nextQuestion();
      }, ms);
    },
    [nextQuestion],
  );

  const submit = useCallback(
    async (answer: string) => {
      const c = cardRef.current;
      if (!c) return;
      const id = ++run.current;
      clearAuto();
      setPhase("grading");
      setNotice(null);
      try {
        const r = await callTool<SubmitAnswer>("submit_answer", { card_id: c.id, answer, hints_used: hintsRef.current.length });
        if (run.current !== id) return;
        setResult(r);
        setSession((s) => [...s, { verdict: r.verdict, topic: c.topic }]);
        setDueRemaining((n) => Math.max(0, n - 1));
        setPhase("feedback");
        await say(r.spoken);
        if (run.current !== id) return;
        if (!r.suggest_explain) scheduleNext(r.verdict === "correct" ? AUTO_NEXT_CORRECT : AUTO_NEXT_MISSED);
      } catch (e) {
        if (run.current === id) fail(e, "ready");
      }
    },
    [say, scheduleNext, fail],
  );

  const requestHint = useCallback(async () => {
    const c = cardRef.current;
    if (!c) return;
    const level = hintsRef.current.length + 1;
    if (level > 3) {
      setNotice("That's every hint for this one. Give it a try, or say I don't know.");
      return;
    }
    const id = ++run.current;
    clearAuto();
    speech.current?.cancel();
    setCharIndex(-1);
    setPhase("hinting");
    setNotice(null);
    try {
      const r = await callTool<Hint>("get_hint", { card_id: c.id, level });
      if (run.current !== id) return;
      setHints((h) => [...h, r.hint]);
      setPhase("ready");
      await say(r.spoken);
    } catch (e) {
      if (run.current === id) fail(e, "ready");
    }
  }, [say, fail]);

  const requestExplain = useCallback(async () => {
    const c = cardRef.current;
    if (!c) return;
    if (!resultRef.current) {
      setNotice("Answer first, or ask for a hint.");
      return;
    }
    if (explainRef.current) {
      void say(explainRef.current.spoken);
      return;
    }
    const id = ++run.current;
    clearAuto();
    speech.current?.cancel();
    setPhase("explaining");
    setNotice(null);
    try {
      const r = await callTool<Explain>("explain_again", { card_id: c.id });
      if (run.current !== id) return;
      setExplain(r);
      setPhase("explained");
      await say(r.spoken);
    } catch (e) {
      if (run.current === id) fail(e, "feedback");
    }
  }, [say, fail]);

  const end = useCallback(() => {
    run.current++;
    clearAuto();
    stopAudio();
    setPhase("ended");
    setNotice(null);
    const s = sessionRef.current;
    const right = s.filter((m) => m.verdict === "correct").length;
    void say(s.length ? `Good session. You got ${right} of ${s.length} right.` : "See you next time.");
  }, [say]);

  /** Everything the user says or types goes through here: commands first, then answers. */
  const handleUtterance = useCallback(
    (text: string) => {
      const cmd = matchCommand(text);
      if (cmd === "stop") return end();
      if (phase === "caught-up" || !cardRef.current) {
        if (cmd === "study-ahead" || cmd === "next") return void nextQuestion(true);
        setNotice('Say "study ahead" to keep going, or "stop" to finish.');
        setPhase("caught-up");
        return;
      }
      if (resultRef.current) {
        // The card is answered: the mic now takes follow-up commands.
        if (cmd === "explain") return void requestExplain();
        if (cmd === "repeat") return void say(explainRef.current?.spoken ?? resultRef.current.spoken);
        return void nextQuestion();
      }
      if (cmd === "skip" || cmd === "next") {
        exclude.current = [...exclude.current, cardRef.current.id];
        return void nextQuestion();
      }
      if (cmd === "repeat") {
        setTranscript("");
        return void ask(cardRef.current);
      }
      if (cmd === "hint") return void requestHint();
      if (cmd === "explain") {
        setNotice("Answer first, or ask for a hint.");
        setPhase("ready");
        return;
      }
      void submit(cmd === "dont-know" ? "I don't know" : text);
    },
    [phase, end, nextQuestion, ask, submit, requestHint, requestExplain, say],
  );

  const startListening = useCallback(async () => {
    const id = ++run.current;
    clearAuto();
    speech.current?.cancel();
    suspendAudio();
    setCharIndex(-1);
    setNotice(null);
    if (!resultRef.current) setTranscript("");
    const backTo: Phase = !cardRef.current ? "caught-up" : resultRef.current ? (explainRef.current ? "explained" : "feedback") : "ready";
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
        onTranscript: (t) => run.current === id && !resultRef.current && setTranscript(t),
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
          if (backTo !== "ready") setPhase(backTo);
          handleUtterance(t);
        },
        onError: (err) => {
          stopDecay();
          meter.current?.stop();
          meter.current = null;
          rec.current = null;
          if (run.current !== id) return;
          if (err === "audio-capture" && !retried && !meterOff.current) {
            // Some devices can't share the mic between the level meter and recognition.
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
  }, [handleUtterance]);

  const start = () => {
    // Starting audio inside the tap unlocks it on mobile browsers before the network round trip.
    unlockAudio();
    exclude.current = [];
    setSession([]);
    const preface = !nudgeSpoken.current && nudge ? nudge.spoken : undefined;
    nudgeSpoken.current = true;
    void nextQuestion(false, preface);
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
    if (!resultRef.current) setTranscript(t);
    setTyped("");
    handleUtterance(t);
  };

  const busy = phase === "loading" || phase === "grading" || phase === "hinting" || phase === "explaining";
  const answered = !!result;
  const inSession = phase !== "start" && phase !== "ended";
  const showCard = !!card && inSession && phase !== "caught-up" && phase !== "loading";
  const micLabel =
    phase === "start"
      ? "Start quiz"
      : phase === "ended"
        ? "Start again"
        : phase === "listening"
          ? "Tap to stop"
          : phase === "grading"
            ? "Marking"
            : busy
              ? "One moment"
              : answered || phase === "caught-up"
                ? "Tap to talk"
                : "Tap to answer";

  const selected = decks?.find((d) => d.id === deckId);
  const totalDue = decks?.reduce((n, d) => n + d.due_count, 0) ?? 0;
  const exam = examLabel(selected ? selected.exam_date : (nudge?.exam?.date ?? null));
  const missed = result && result.verdict !== "correct";

  return (
    <div className="quiz">
      <header className="quiz-head">
        <span className="wordmark">
          Viva
          <svg className="wordmark-swash" viewBox="0 0 80 10" preserveAspectRatio="none" aria-hidden="true">
            <path pathLength={1} d="M2 6 C 20 2, 40 9, 78 4" />
          </svg>
        </span>
        <div className="quiz-head-right">
          {exam && (
            <span className="chip chip-exam">
              <CalendarIcon className="chip-icon" />
              {exam}
            </span>
          )}
          <label className="deck-picker">
            <span className="visually-hidden">Deck</span>
            <select
              value={deckId}
              onChange={(e) => {
                setDeckId(e.target.value);
                exclude.current = [];
                nudgeSpoken.current = false;
                if (inSession) {
                  run.current++;
                  clearAuto();
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
        </div>
      </header>

      {inSession && (
        <div className="session-strip" aria-label={`${session.length} answered, ${dueRemaining} due`}>
          <span className="session-marks">
            {session.slice(-10).map((m, i) => (
              <MiniMark key={session.length - Math.min(10, session.length) + i} verdict={m.verdict} />
            ))}
          </span>
          <span className="session-count">
            {session.length} answered · {dueRemaining} due
          </span>
        </div>
      )}

      <section className="quiz-stage" aria-live="polite">
        {phase === "start" && (
          <div className="intro">
            <h1 className="intro-title">
              Say it <span className="swash-word">out loud</span>.
            </h1>
            <p className="intro-nudge">{nudge ? nudge.nudge : <LineSkeleton label="Loading a suggestion" width="16em" />}</p>
            <p className="intro-meta">
              {decks == null ? (
                <LineSkeleton label="Loading your decks" width="11em" />
              ) : (
                <>
                  {selected?.title ?? "All decks"} · {selected ? selected.due_count : totalDue} due
                </>
              )}
            </p>
            <div className="say-chips" aria-label="Things you can say">
              <span className="say-label">You can say</span>
              {["hint", "repeat", "skip", "I don't know", "explain", "stop"].map((c, i) => (
                <span key={c} className="say-chip" style={{ ["--i" as string]: i }}>
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        {phase === "ended" && <SessionSummary session={session} />}

        {phase === "loading" && <QuestionSkeleton label={session.length ? "Finding your next question" : "Finding a question"} />}

        {showCard && card && (
          <>
            <p className="card-meta">
              <span>{card.topic}</span>
              {reason === "exam_focus" && <span className="chip chip-quiet">Weak spot before your exam</span>}
              {reason === "prerequisite" && <span className="chip chip-quiet">Building block</span>}
              {reason === "ahead" && <span className="chip chip-quiet">Studying ahead</span>}
            </p>
            <div className={`question-row${answered ? " is-answered" : ""}`}>
              <ReadingLine key={card.id} text={card.front} charIndex={phase === "asking" ? charIndex : -1} />
              {result && <Mark key={`${card.id}-mark`} verdict={result.verdict} />}
            </div>

            {hints.map((h, i) => (
              <p key={i} className="hint-note">
                <span className="hint-label">Hint {i + 1} of 3</span>
                {h}
              </p>
            ))}
            {phase === "hinting" && <MarkingLine label="Thinking of a hint" />}

            {transcript && (
              <p className="transcript">
                {transcript.split(/\s+/).map((w, i) => (
                  <span key={i} className="t-word">
                    {w}{" "}
                  </span>
                ))}
              </p>
            )}
            {phase === "grading" && <MarkingLine />}

            {result && (
              <div className="feedback">
                <p>{result.feedback}</p>
                {result.correct_answer && (
                  <p className="feedback-answer">
                    <span className="feedback-label">Answer </span>
                    {result.correct_answer}
                  </p>
                )}
              </div>
            )}

            {phase === "explaining" && <MarkingLine label="Finding another way to explain it" />}
            {explain && (
              <div className="explain">
                <p className="explain-label">Another way to see it</p>
                <p className="explain-text">{explain.explanation}</p>
                {explain.prerequisite_card && (
                  <p className="explain-added">
                    Added an easier card first: <em>{explain.prerequisite_card.front}</em>
                  </p>
                )}
              </div>
            )}

            {autoNext && (
              <div className="auto-next" key={autoNext.key}>
                <span className="auto-next-bar" style={{ animationDuration: `${autoNext.ms}ms` }} />
                <span className="auto-next-label">Next question coming up</span>
                <button type="button" className="text-button" onClick={clearAuto}>
                  Stay here
                </button>
              </div>
            )}
          </>
        )}

        {notice && (
          <p className="notice" key={notice}>
            {notice}
          </p>
        )}

        <div ref={stageEnd} className="stage-end" aria-hidden="true" />

        {phase === "caught-up" && (
          <div className="row-actions">
            <button type="button" className="button button-chalk" onClick={() => void nextQuestion(true)}>
              Study ahead
            </button>
            <Link className="text-button" href="/notes" transitionTypes={["nav-forward"]}>
              Add notes
            </Link>
          </div>
        )}
      </section>

      <footer className={`quiz-controls${inSession ? " is-session" : ""}`}>
        {showCard && (
          <div className="toolbar" role="toolbar" aria-label="Quiz actions">
            {!answered ? (
              <>
                <ToolButton label={hints.length ? `Hint ${Math.min(hints.length + 1, 3)}` : "Hint"} onClick={() => void requestHint()} disabled={busy || hints.length >= 3}>
                  <HintIcon />
                </ToolButton>
                <ToolButton label="Repeat" onClick={() => handleUtterance("repeat")} disabled={busy}>
                  <RepeatIcon />
                </ToolButton>
                <ToolButton label="Skip" onClick={() => handleUtterance("skip")} disabled={busy}>
                  <SkipIcon />
                </ToolButton>
                <ToolButton label="Don't know" onClick={() => handleUtterance("I don't know")} disabled={busy}>
                  <ShrugIcon />
                </ToolButton>
              </>
            ) : (
              <>
                <ToolButton label="Repeat" onClick={() => handleUtterance("repeat")} disabled={busy}>
                  <RepeatIcon />
                </ToolButton>
                {missed && (
                  <ToolButton label="Explain" onClick={() => void requestExplain()} disabled={busy} highlight={result?.suggest_explain && !explain}>
                    <ExplainIcon />
                  </ToolButton>
                )}
                <ToolButton label="Next" onClick={() => void nextQuestion()} disabled={busy}>
                  <NextIcon />
                </ToolButton>
              </>
            )}
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
              placeholder={answered ? "Type next or explain" : "Type your answer"}
              autoComplete="off"
              disabled={busy}
            />
            <button type="submit" disabled={busy || !typed.trim()}>
              Send
            </button>
          </form>
        )}

        <div className={`mic-row${inSession ? " is-compact" : ""}`}>
          {inSession ? (
            <button
              type="button"
              className={`round-tool${textMode ? " is-on" : ""}`}
              onClick={() => setTextMode((t) => !t)}
              aria-pressed={textMode}
              aria-label={textMode ? "Hide typing" : "Type instead"}
              disabled={!voiceIn}
            >
              <KeyboardIcon />
              <span>Type</span>
            </button>
          ) : (
            <span className="round-spacer" />
          )}
          {(!textMode || !inSession || voiceIn) && (
            <Mic
              listening={phase === "listening"}
              busy={busy || (!voiceIn && inSession)}
              inviting={phase === "start" || phase === "ended"}
              level={level}
              label={micLabel}
              onPress={onMic}
            />
          )}
          {inSession ? (
            <button type="button" className="round-tool" onClick={end} aria-label="End session">
              <StopIcon />
              <span>End</span>
            </button>
          ) : (
            <span className="round-spacer" />
          )}
        </div>
      </footer>
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  disabled,
  highlight,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className={`tool${highlight ? " is-suggested" : ""}`} onClick={onClick} disabled={disabled}>
      <span className="tool-icon">{children}</span>
      <span className="tool-label">{label}</span>
    </button>
  );
}

function SessionSummary({ session }: { session: SessionMark[] }) {
  const right = session.filter((m) => m.verdict === "correct").length;
  const partly = session.filter((m) => m.verdict === "partial").length;
  const toRevisit = [...new Set(session.filter((m) => m.verdict !== "correct").map((m) => m.topic))].slice(0, 3);
  const pct = session.length ? Math.round((right / session.length) * 100) : 0;
  return (
    <div className="summary-panel">
      <h1 className="intro-title">{!session.length ? "See you soon." : pct >= 80 ? "Strong session." : pct >= 50 ? "Good work." : "Every miss counts."}</h1>
      {session.length > 0 ? (
        <>
          <div className="summary-stats">
            <p>
              <span className="stat-num">
                <CountUp value={right} />
              </span>
              <span className="stat-label">right</span>
            </p>
            <p>
              <span className="stat-num">
                <CountUp value={partly} />
              </span>
              <span className="stat-label">partly</span>
            </p>
            <p>
              <span className="stat-num">
                <CountUp value={session.length} />
              </span>
              <span className="stat-label">answered</span>
            </p>
          </div>
          {right > 0 && <Tally count={right} delay={300} className="tally-chalk" />}
          {toRevisit.length > 0 && (
            <p className="intro-nudge">
              Worth another look: {toRevisit.join(", ")}. {session.some((m) => m.verdict === "incorrect") ? "Missed cards come back in about ten minutes." : ""}
            </p>
          )}
        </>
      ) : (
        <p className="intro-nudge">You stopped before answering. Your cards are waiting.</p>
      )}
      <p className="intro-meta">
        <Link href="/progress" transitionTypes={["nav-forward"]}>
          See your progress
        </Link>
      </p>
    </div>
  );
}
