# Submission text

Ready-to-paste text for the hackathon submission form. **Track:** Alexa+.

**Links**
- Live demo: https://viva-mcp.vercel.app (no sign-up)
- MCP endpoint: https://viva-mcp.vercel.app/api/mcp (Streamable HTTP, protocol 2025-11-25)
- Code: https://github.com/Nana-Kojo801/viva-mcp (MIT)

---

## Tagline

Viva is a study partner that quizzes you out loud on your own notes, grades what you say, and schedules your reviews.

## Inspiration

Saying an answer out loud is one of the best ways to remember it, and it's how a viva voce (an oral exam) works. But studying alone usually means rereading highlighted notes. A voice assistant in the room is the obvious examiner, as long as it knows *your* material and what you keep getting wrong.

## What it does

- **Bring your own material.** Paste notes, upload a PDF, Word document or slide deck (speaker notes included), or take a photo of handwritten notes. Viva writes 8 to 20 questions per section that can be answered aloud in a sentence or two. You review them and delete any you don't want.
- **Get quizzed out loud.** Viva reads each question with a natural voice while a highlighter follows the words. You answer in your own words, and Viva grades the meaning rather than exact wording, so filler words and transcription slips don't count against you.
  - It draws an examiner's tick, partial circle or cross, says what you got and what you missed, and moves on.
  - Say **hint** for up to three increasingly revealing hints.
  - Say **explain** after a miss, and Viva explains it another way and adds an easier building-block card.
  - **Skip**, **repeat**, **I don't know** and **stop** work too.
- **Remember it.** SM-2 spaced repetition schedules every card: misses come back in minutes, and answers you know drift out to days and weeks. When an exam date is close, Viva pulls your weakest topics forward and opens each session with a short spoken nudge ("Your biology exam is in 5 days. Osmosis needs the most work, so I'll start there.").
- **See progress.** The Progress screen shows your streak, cards due, weekly accuracy, a hand-drawn tally of correct answers, and your weakest topics.

## How it's built for the Alexa+ track

Viva is **a real MCP server and a simulated Alexa+ experience that uses it**:

- **MCP server:** `/api/mcp` serves 11 tools over Streamable HTTP, spec `2025-11-25`, stateless for serverless functions:
  - `list_decks`, `add_material`, `get_next_card`, `submit_answer`, `get_progress`, `set_exam_date`, `delete_card`
  - `get_hint`, `explain_again`, `get_study_nudge`, `read_notes_photo`

  Every tool has zod input and output schemas, and returns structured data plus a short `spoken` line written for text-to-speech (plain sentences, at most three). Errors come back as friendly spoken messages, never raw exceptions. The server's `initialize` instructions describe the voice loop for an agent.
- **Simulated device:** the Quiz screen is the device, with the browser mic (Web Speech recognition), the speaker (Google Cloud TTS through Web Audio, falling back to the browser voice), and voice commands. Every study action it takes is a real MCP call through the official TypeScript SDK client, over HTTP, to the same endpoint an Alexa+ agent would use.

**Stack:** Next.js 16 on Vercel, MCP TypeScript SDK, Turso (libSQL), OpenAI (strict JSON outputs, validated with zod), Google Cloud Text-to-Speech, and the Web Speech API. Office files and PDFs are read in the browser with fflate and unpdf.

**Kept free to try:** there's no login; every visitor gets an anonymous id and their own copy of a demo deck. Daily caps on AI calls and speech characters protect the budget. Everything AI produces (cards, hints, explanations) is generated once and stored.

## Challenges

- **The microphone on Android.** Showing a live input level on the mic button quietly starved speech recognition of audio on phones. It produced no error, only silence. Phones now animate the mic from recognition events instead.
- **A natural voice that stays in sync.** Browser voices sounded robotic and reported word timings late or not at all. Viva now plays cloud-generated speech through Web Audio and moves the highlighter by the audio clock.
- **Honest grading of speech.** Transcripts are messy. The grader is told to judge understanding, to be generous between "correct" and "partial", but never to stretch a wrong answer into "partial". That needed a couple of rounds of testing against real answers.
- **Friendly errors over MCP.** The SDK client rejected error results whose structured content didn't match the success schema, so error messages are sent as text content instead. This is written up in the friction log.

## Accomplishments

- One codebase that is a standards-compliant MCP server *and* a polished voice product, with the simulation provably using the same protocol.
- A design that doesn't look like a template: an oral exam made tactile, with a deep-cobalt exam room, a reading-line highlighter, hand-drawn examiner's marks, and a tally-mark progress ledger.
- Real support for students' actual material: PDFs, slide decks with speaker notes, and photos of handwriting.

## What we learned

- Designing tools for a voice agent is different from designing for a screen: every response needs a short spoken form, and the agent needs to be told the loop.
- On the web, voice platform quirks (microphone sharing, speech timing) matter more than any framework choice.

## What's next

- Connect the MCP server to a real Alexa+ device and tune the spoken responses for it.
- Shared decks for study groups and classes.
- Accounts that are optional, so progress can follow you between devices.
- Smarter scheduling around multiple exams.
