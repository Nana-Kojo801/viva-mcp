# Design

## Concept: a study desk you can hold

Viva is named for the viva voce, an exam taken out loud. The interface is a study desk: a sage desk surface, a stack of index cards, typed questions, your answers in blue pen, sticky-note hints and the examiner's rubber stamp. Every screen is made of things you would find on that desk, so the app reads as one physical place rather than a set of web pages.

This direction ("A · Index cards") was chosen by the builder from six explored directions: index cards, a Swiss signal grid, a night-lamp conversation, a topographic map, a musical score and a risograph zine.

## Tokens

```css
--desk: #D9DED6;        /* the desk surface behind everything */
--desk-deep: #C9D0C6;   /* inactive folder tabs */
--card: #FFFFFF;        /* index cards */
--rule: #CFDBEC;        /* blue ruled lines on cards */
--margin: #E0524A;      /* the red header rule on every card */
--ink: #1D2433;         /* typed text, borders */
--pencil: #3A4150;      /* secondary text */
--muted: #5B6170;       /* labels */
--pen: #2F49C8;         /* your handwriting, links, primary buttons */
--highlight: #FFE45C;   /* the reading line */
--sticky: #FFF4A8;      /* hint sticky notes */
--record: #E0524A;      /* the record button */
--correct: #2E8B57; --partial: #A8690F; --wrong: #C23B33;   /* stamps and marks only */
```

Contrast: ink on white is about 15:1, muted on white about 6:1, pen blue on white about 7:1. White text on the record red is used only for the glyph.

## Type

- **IBM Plex Mono** for anything typed by Viva: questions, card labels, buttons, tabs, headings ("new deck.", "this week.").
- **Caveat** for anything written by you: transcripts, hints on sticky notes, typed answers, the big handwritten numbers on Progress.
- **IBM Plex Sans** for reading text: feedback, explanations, descriptions.

Headings and controls are lowercase, typewriter style, with a full stop on page titles. Body copy stays in sentence case.

## Screens

- **Quiz.** A stack of cards: the active card on top, two more peeking out at angles behind it. The card has a header (topic, card number, due count, an exam countdown), the red margin rule, and a blue-ruled body.
  - The question is typed on the rules, and a yellow highlighter follows the word being spoken.
  - Hints are sticky notes stuck onto the card.
  - Your transcript appears in blue pen under a dashed line.
  - Grading thumps a rubber stamp (correct / partly / missed) in the corner.
  - Feedback sits in a pale blue box.
  - A re-explanation is a fresh card slid on top.
  - Tools are typed paper tags. The mic is a red record button, with Type and End beside it.
- **Notes.** The notes box is itself a big index card. Paste / photo / file are typed tags. Photos appear as polaroids. Generated cards come in as a little pile of index cards, and deleting one tosses it off the pile. Decks are stacked dividers.
- **Progress.** Handwritten numbers on a card (streak in blue, due in red, accuracy in green). The week is seven mini index cards with tally marks; rest days are dashed. Weakest topics are stacked dividers with the miss count handwritten in red.
- **Navigation.** Folder tabs along the bottom; the active tab is white and taller, as if pulled forward.

## Motion

Every movement is something a card, a pen or a stamp would do:

- **Deal:** a new card slides onto the stack from the right with a slight turn, and the cards behind shift.
- **Type:** question words appear left to right, as if typed. The highlighter swipes along with the voice.
- **Stick:** sticky notes and message slips drop on and settle at an angle.
- **Thump:** the stamp lands big and rotated, then settles.
- **Record:** the record button pulses before the first tap. While listening, red rings ripple out faster and wider as your voice gets louder, and the stop square blinks.
- **Toss:** deleted cards fly off the pile, and the gap closes.
- **Tally:** strokes draw one after another, card by card.
- **Tabs:** folder tabs rise when hovered and when active. Pages slide left or right in tab order (React `<ViewTransition>`), and the tabs themselves stay still.

All of it switches off under `prefers-reduced-motion`.

## Loading states

- **Drawing a card:** blank lines on the card, with the highlighter sweeping along each line.
- **Marking:** a pencil underline drawing itself under your answer.
- **Making cards:** a fresh index card being typed line by line, with plain steps ("Reading your notes", "Writing questions you can answer aloud").
- **Progress:** placeholder day cards dealt onto the desk.
