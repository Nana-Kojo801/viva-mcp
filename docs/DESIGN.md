# Design plan

## Concept

An oral exam, made tactile. Viva is named for the viva voce, an exam taken out loud. The interface is mostly typography and voice, with very little chrome. Three screens share one room: the quiz is that room with the lights down (cobalt), and the notes and progress screens are the same room with the lights up (paper).

## Tokens

```css
--cobalt: #2338D9;      /* quiz field, full-bleed */
--cobalt-deep: #1B2CB0; /* pressed states and the mic ring on cobalt */
--paper: #E9ECF4;       /* notes and progress background (cool blue-grey, never cream) */
--chalk: #F2F5FF;       /* type on cobalt */
--highlighter: #FFD93B; /* only the reading line and the active mic */
--pencil: #3A3A46;      /* examiner marks, secondary text, type on paper */
--ink: #141833;         /* primary type on paper */
--rule: #C5CBE0;        /* ruled lines on paper */
--correct: #1E9E6A;     /* marks only */
--partial: #E8A21A;     /* marks only */
--wrong: #D6453D;       /* marks only */
```

Contrast: chalk on cobalt is about 7.6:1; ink on paper is about 15:1; pencil on paper is about 9.4:1; ink on highlighter is about 14:1. The transcript on cobalt uses chalk at 72% opacity, which still clears 4.5:1.

## Type

- Literata (text serif) for questions, answers, transcripts, deck titles and weak topics. Questions are set at `clamp(1.75rem, 6.5vw, 2.6rem)` with a line height of 1.25 and a measure of at most 22em, which is under 70 characters.
- Schibsted Grotesk (humanist grotesk) for controls, navigation, and small labels.
- Sentence case everywhere. No all-caps eyebrow labels. Labels are plain text in pencil at a normal size.

## Layout sketch (360px wide)

```
Quiz (cobalt, full-bleed)
+--------------------------------+
| Viva        Supply and demand v|  <- grotesk, chalk. The deck picker is a native <select>
|                                |
| 3 of 12                        |  <- small, chalk at 70%
|                                |
| What happens in a market when  |  <- Literata, large; the spoken word is behind a
| the price is set [above] equi- |     highlighter bar that moves word by word
| librium?                    ✓  |  <- examiner mark, drawn once, in the margin
|                                |
| "there's a surplus so prices   |  <- live transcript, Literata italic, chalk 72%
|  fall"                         |
|                                |
| Right. Sellers offer more than |  <- feedback, grotesk, chalk
| buyers want.                   |
|                                |
|          Skip   Repeat         |  <- quiet text buttons
|             ( O )              |  <- the mic: 88px circle, bottom-center,
|        Tap to answer           |     breathes with input level
+--------------------------------+
| Quiz     Notes     Progress    |  <- bottom bar, grotesk
+--------------------------------+

Notes (paper)
  Title [______________]
  Exam date (optional) [____]
  Notes
  [ large ruled textarea, Literata ]
  [ Make cards ]  or upload a .txt or .md file
  -> generated cards listed as front / back pairs, each with "Delete"

Progress (paper)
  Streak 4 days · 11 due today · 82% right this week   <- one line of serif, not tiles
  This week
  Mon |||| ||        <- ruled tally, one stroke per correct answer, groups of five
  Tue ||||
  ...
  Weakest topics
  1. Elasticity          3 of 5 missed
  2. Demand shifters     2 of 6 missed
```

## The one memorable thing: the reading line

The question is split into word spans. A single absolutely positioned highlighter bar slides to the span being spoken, driven by `SpeechSynthesisUtterance` `boundary` events (`charIndex`). If boundary events never arrive within 400 ms, a time-based sweep takes over at an estimated rate. Words already spoken stay chalk; the current word sits on yellow in ink. Under `prefers-reduced-motion`, the bar jumps without sliding.

## Examiner's marks

These are hand-drawn SVG paths with slight wobble: a tick (correct), a loose open circle with a wavy edge (partial), and a cross of two uneven strokes (wrong). Each is drawn once with `stroke-dashoffset` over 450 ms, in the mark color on a chalk disc so it reads on cobalt. With reduced motion, the mark appears without drawing.

## Mic control

An 88px chalk circle at the bottom center, inside the thumb zone. When it is listening, it turns highlighter and scales between 1.0 and 1.18 with the RMS level from a Web Audio `AnalyserNode`. It has a visible focus ring (3px chalk outline with offset). The label under it says what a tap will do: "Tap to answer", "Tap to stop", "Checking...".

## Loading states

Loading states are drawn from the same motifs as the rest of the app, not spinners:

- Waiting for a question: three blank lines in the question face, with the highlighter sweeping along each line in turn, captioned "Finding a question".
- Marking an answer: a chalk pencil stroke underlines the transcript, again and again, captioned "Marking your answer".
- Making cards: a ruled page whose lines fill with pencil in turn, with plain steps ("Reading your notes", then "Writing questions you can answer aloud").
- Progress: the ledger is ruled out empty before the tally arrives.

All of these stop moving under `prefers-reduced-motion`.

## Motion

The first version kept motion to the reading line and the mark. After testing on a phone, the builder asked for a more finished, more animated product, so motion now does more work. It still follows the same rules: every movement either explains something or acknowledges a touch, and the reading line and the mark stay the loudest moments.

- **Arrival:** each screen's content rises in with a short stagger. Question words settle in one by one, slightly blurred, before Viva starts reading. The "out loud" highlighter swipes in on the start screen, and the wordmark underline draws itself.
- **Navigation:** the tabs slide left or right by their order (Quiz, Notes, Progress) through React `<ViewTransition>`, while the background crossfades between cobalt and paper. The tab indicator springs to the active tab.
- **Voice:** the mic halos pulse gently before a session to invite the first tap. While listening, rings ripple outward faster and wider as your voice gets louder.
- **Marking:** the examiner's mark stamps in (scale and rotate), then strokes on. A matching mini mark pops into the session strip.
- **Follow-ups:** hints and notices slide in from the margin. The explanation card rises with a slight spring. A chalk line drains toward the next question, and "Stay here" stops it.
- **Records:** progress numbers count up. Tally strokes draw one after another, day by day. Volume lines and weak-topic bars grow from the left. Deleted cards slide away, and the gap closes behind them.
- **Touch:** buttons, tools, and the mic press down slightly. On a pointer device, arrows nudge forward on hover.

Everything honours `prefers-reduced-motion`: animations collapse to their end state, and the rings, spinner, and scan line are hidden.

## Production polish

- Paper grain over every screen, and a soft same-hue vignette on cobalt (no gradients between hues).
- A custom stroke icon set (mic, page, tally, hint, repeat, skip, shrug, explain, calendar, camera) in one consistent hand.
- Mobile: a frosted tab bar with icons. Desktop (1100px and wider): a floating centered pill, and the quiz controls become a floating dock.
- The quiz controls are compact: a row of tools above the mic, with Type and End beside it. They sit on frosted cobalt, so text scrolling underneath never shows through.
- The notes screen has one sheet with a paste / photo / file switch, a ruled textarea with a margin line, a photo preview with a highlighter scan while it is read, and a deck list with inline exam dates.

## Review against the brief

- Default component-library look? No library. Native elements are styled by hand, and there are no cards or shadows.
- Identical rounded cards with grey shadows? None. Generated cards on the notes screen are a ruled list, not boxes.
- Gradients, cream and terracotta, near-black with neon? No. The palette is flat cobalt, cool paper, and one yellow.
- All-caps eyebrows? None.
- Dashboard tiles or pie charts on progress? Replaced by a sentence and a tally.
- Emojis as icons? None. Marks and the mic are SVG and CSS.

Revision after review: the first sketch put the stats on the progress screen in three boxes. That read as a default dashboard, so they became one sentence in the serif.
