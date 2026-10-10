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

## Motion budget

Only the reading line and the mark move. There are no page transitions, scroll fades, or hover animations. Buttons change color instantly.

## Review against the brief

- Default component-library look? No library. Native elements are styled by hand, and there are no cards or shadows.
- Identical rounded cards with grey shadows? None. Generated cards on the notes screen are a ruled list, not boxes.
- Gradients, cream and terracotta, near-black with neon? No. The palette is flat cobalt, cool paper, and one yellow.
- All-caps eyebrows? None.
- Dashboard tiles or pie charts on progress? Replaced by a sentence and a tally.
- Emojis as icons? None. Marks and the mic are SVG and CSS.

Revision after review: the first sketch put the stats on the progress screen in three boxes. That read as a default dashboard, so they became one sentence in the serif.
