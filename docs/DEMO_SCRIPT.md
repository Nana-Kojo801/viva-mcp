# Demo script (2 minutes)

The video has to show five things: adding notes, the spoken quiz, a graded answer, the progress screen, and the MCP endpoint. The script below fits all five, plus the hint and explain features, into 2:00. The voiceover is about 250 words, a calm speaking pace.

## Before you record

- [ ] **Natural voice is on.** `GOOGLE_TTS_API_KEY` is set in Vercel. Open the quiz once and confirm the voice isn't the robotic browser voice.
- [ ] **A deck of your own is ready.** Do the full "Make cards" run once beforehand, because generation takes 10 to 30 seconds. In the video, show the upload and then cut straight to the finished cards.
- [ ] **Exam date set** on that deck, about 5 days out, so the study nudge mentions it. Set it from Notes → Your decks → Add exam date.
- [ ] **Some history on the Progress screen.** Answer 6 to 8 cards the day before (miss a couple on purpose), so the tally and the weakest topics have something to show.
- [ ] **A file to upload** on the phone: a short lecture PDF or PowerPoint with speaker notes (2 to 5 pages works well).
- [ ] **Laptop ready for the MCP beat:** a terminal with the two `curl` commands from the README pasted in, or the MCP Inspector connected to `https://viva-mcp.vercel.app/api/mcp`.
- [ ] Phone on **Do Not Disturb**, brightness up, and Chrome's address bar scrolled away.
- [ ] Record the phone with Android's screen recorder, set to **"Device audio and microphone"** so Viva's voice and yours are both captured. Use a quiet room.

## Script

| Time | On screen | Voiceover |
|---|---|---|
| **0:00–0:08** | Quiz start screen. The highlighter swipes behind "out loud". | "Rereading notes feels like studying, but saying the answer out loud is what makes it stick. Viva is a study partner that examines you by voice." |
| **0:08–0:28** | **Notes → File → choose the lecture PDF.** The text fills the box ("Read 3 pages from…"). Type a title and tap **Make cards**. The ruled page starts writing… *(cut)* …the finished cards slide in. Delete one with the bin icon. | "Bring your own material: paste it, upload a PDF, Word file or slide deck with speaker notes, or snap a photo of handwritten notes. Viva writes questions you can answer out loud, and you keep only the good ones." |
| **0:28–0:40** | Tap **Quiz**. The page slides over. Tap the mic. Viva speaks the nudge ("Your biology exam is in 5 days…"), then the question, with the highlighter following each word. | "When you start, Viva knows your exam is close and leads with your weakest topic. Every question is read aloud, and the highlighter tracks the voice word by word." |
| **0:40–0:55** | Tap the mic and **answer out loud**, a little informally. The live transcript appears, the pencil underline marks it, and the **tick draws on**. Viva speaks the feedback, and the next question comes up. | "Answer in your own words. Viva grades the meaning, not the wording, so filler words and transcription slips are fine. It tells you what you got and what you missed." |
| **0:55–1:12** | Next question: say **"hint"**. The hint slides in and is spoken. Answer wrongly on purpose, and the **cross draws**. Say **"explain"**. The explanation card rises: "Another way to see it…", with "Added an easier card first". | "Stuck? Ask for a hint, up to three, each one giving a bit more away. Miss it, and Viva explains it a different way, then adds an easier building-block card to the deck before trying again." |
| **1:12–1:25** | Tap **End**. The session summary counts up. Tap **Progress**. The tally strokes draw day by day, and the weakest topics bars grow. | "Spaced repetition schedules every card: misses come back in minutes, and answers you know drift out to days and weeks. Progress shows your streak, a tally of the week, and where you're weakest." |
| **1:25–1:48** | **Laptop.** Run `initialize` (highlight `"protocolVersion":"2025-11-25"`), then `tools/list`, scrolling past `get_next_card`, `submit_answer`, `get_hint` and `explain_again`. Optionally call `get_next_card` and highlight the `spoken` field. | "Everything you just saw ran through a real MCP server. The quiz screen is a simulated Alexa+ device that calls the same Streamable HTTP endpoint an Alexa+ agent would. There are eleven tools, and each returns structured data plus a short spoken line ready for text-to-speech." |
| **1:48–2:00** | Back to the phone: the start screen, with the live URL as a caption. | "Viva is open source, free to try with no sign-up, and built on the MCP TypeScript SDK, Next.js, Turso and OpenAI. Say it out loud." |

## Captions to add in editing

- 0:10: "PDF · Word · PowerPoint · photo of notes"
- 0:42: "Graded by meaning, not wording"
- 1:15: "SM-2 spaced repetition"
- 1:30: "MCP 2025-11-25 · Streamable HTTP · 11 tools"
- 1:50: "viva-mcp.vercel.app · github.com/Nana-Kojo801/viva-mcp"

## If something goes wrong on camera

- **Viva mishears you:** say "repeat" and answer again. A slightly off transcript is fine to keep, because it shows the grading ignores slips.
- **The grade is generous or harsh:** keep it. It's real. Or tap **Next** and pick a cleaner card.
- **The voice falls back to the robotic one:** the daily voice budget or the key is the cause. Check `GOOGLE_TTS_API_KEY` and re-record.
- **"Demo limit reached":** the daily AI cap was hit during rehearsals. Raise `AI_SESSION_DAILY_CAP` in Vercel temporarily, redeploy, and set it back afterwards.

## Words to avoid

Say "a simulated Alexa+ experience" or "the Alexa+ track" in plain words. Don't show Amazon or Echo logos, and don't call the app anything but Viva.
