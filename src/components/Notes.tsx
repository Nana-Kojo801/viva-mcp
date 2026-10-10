"use client";

import Link from "next/link";
import { useState } from "react";
import { callTool, ToolError, type AddMaterial } from "@/lib/client/mcp";

const MAX_FILE_BYTES = 500_000;

export function Notes() {
  const [title, setTitle] = useState("");
  const [examDate, setExamDate] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deck, setDeck] = useState<AddMaterial | null>(null);
  const [cards, setCards] = useState<AddMaterial["cards"]>([]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/\.(txt|md|markdown)$/i.test(file.name)) return setError("That file type isn't supported. Choose a .txt or .md file.");
    if (file.size > MAX_FILE_BYTES) return setError("That file is too large. Choose one under 500 KB, or paste the part you need.");
    setText(await file.text());
    if (!title) setTitle(file.name.replace(/\.(txt|md|markdown)$/i, "").replace(/[-_]+/g, " "));
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (text.trim().length < 40) return setError("Those notes are too short. Paste at least a few sentences.");
    setBusy(true);
    try {
      const r = await callTool<AddMaterial>("add_material", {
        title: title.trim() || "My notes",
        text,
        ...(examDate ? { exam_date: examDate } : {}),
      });
      setDeck(r);
      setCards(r.cards);
      setText("");
      setTitle("");
      setExamDate("");
    } catch (err) {
      setError(err instanceof ToolError ? err.message : "Making cards failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    const before = cards;
    setCards((cs) => cs.filter((c) => c.id !== id));
    try {
      await callTool("delete_card", { card_id: id });
    } catch (err) {
      setCards(before);
      setError(err instanceof ToolError ? err.message : "Deleting failed. Try again.");
    }
  };

  return (
    <div className="page">
      <h1 className="page-title">Add notes</h1>
      <p className="page-lede">Paste notes from a class or a chapter. Viva turns them into questions you can answer out loud.</p>

      {deck && (
        <section className="made" aria-labelledby="made-title">
          <h2 id="made-title" className="section-title">
            {cards.length} {cards.length === 1 ? "card" : "cards"} from {deck.title}
          </h2>
          <p className="muted">
            Read them over and delete any that miss the point.{deck.truncated ? " Your notes were long, so only the first part was used." : ""}
          </p>
          <ol className="card-list">
            {cards.map((c) => (
              <li key={c.id} className="card-item">
                <p className="card-front">{c.front}</p>
                <p className="card-back">{c.back}</p>
                <div className="card-meta">
                  <span>{c.topic}</span>
                  <button type="button" className="text-button danger" onClick={() => void remove(c.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <div className="row-actions">
            <Link className="button" href={`/?deck=${deck.deck_id}`}>
              Start quiz
            </Link>
            <button type="button" className="text-button" onClick={() => setDeck(null)}>
              Add more notes
            </button>
          </div>
        </section>
      )}

      {!deck && (
        <form className="notes-form" onSubmit={submit}>
          <label className="field">
            <span>Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Cell biology, chapter 3" maxLength={120} />
          </label>
          <label className="field">
            <span>Exam date (optional)</span>
            <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Notes</span>
            <textarea
              className="ruled"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={12}
              placeholder="Paste your notes here."
            />
          </label>
          <p className="muted small">
            {text.length.toLocaleString("en-US")} characters. Up to 24,000 are used.{" "}
            <label className="file-link">
              Or upload a .txt or .md file
              <input type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" onChange={onFile} />
            </label>
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="button" disabled={busy}>
            {busy ? "Making cards..." : "Make cards"}
          </button>
          {busy && <p className="muted small">This takes about 10 to 30 seconds.</p>}
        </form>
      )}
    </div>
  );
}
