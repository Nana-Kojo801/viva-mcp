"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowIcon, CalendarIcon, CameraIcon, FileIcon, PasteIcon, TrashIcon } from "./Icons";
import { LineSkeleton, WritingCards } from "./Loading";
import { examLabel } from "@/lib/dates";
import { ACCEPT, extractText, ExtractError, IMAGE } from "@/lib/client/extract";
import { callTool, peekTool, ToolError, type AddMaterial, type Deck, type ListDecks, type NotesPhoto } from "@/lib/client/mcp";

const NOTES_LIMIT = 24_000;
type Source = "paste" | "photo" | "file";

const SOURCES: { key: Source; label: string; Icon: (p: { className?: string }) => React.ReactElement }[] = [
  { key: "paste", label: "Paste", Icon: PasteIcon },
  { key: "photo", label: "Photo", Icon: CameraIcon },
  { key: "file", label: "File", Icon: FileIcon },
];

export function Notes() {
  const [source, setSource] = useState<Source>("paste");
  const [title, setTitle] = useState("");
  const [examDate, setExamDate] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [deck, setDeck] = useState<AddMaterial | null>(null);
  const [cards, setCards] = useState<AddMaterial["cards"]>([]);
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [decks, setDecks] = useState<Deck[] | null>(() => peekTool<ListDecks>("list_decks")?.decks ?? null);
  const [readingFile, setReadingFile] = useState<string | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);

  const loadDecks = useCallback(() => {
    callTool<ListDecks>("list_decks").then(
      (r) => setDecks(r.decks),
      () => setDecks([]),
    );
  }, []);
  useEffect(loadDecks, [loadDecks]);

  const applyText = (t: string, from: string) => {
    setText((prev) => (prev.trim() ? `${prev.trim()}\n\n${t}` : t));
    setSource("paste");
    setError(null);
    setInfo(from);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (IMAGE.test(file.name) || file.type.startsWith("image/")) {
      // Pictures of notes go through the photo reader.
      setSource("photo");
      setPendingPhoto(file);
      return;
    }
    setReadingFile(file.name);
    try {
      const r = await extractText(file);
      const base = file.name.replace(/\.[a-z0-9]+$/i, "");
      if (!title) setTitle(base.replace(/[-_]+/g, " "));
      const size = `${r.text.length.toLocaleString("en-US")} characters`;
      applyText(
        r.text,
        `Read ${r.note ? `${r.note} from ` : ""}${file.name} (${size}).${r.text.length > NOTES_LIMIT ? " Only the first 24,000 characters are used, so trim it to the part you need." : " Check it, then make cards."}`,
      );
    } catch (err) {
      setError(err instanceof ExtractError ? err.message : "Reading that file failed. Try again, or paste the text.");
    } finally {
      setReadingFile(null);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (text.trim().length < 40) return setError("Those notes are too short. Add at least a few sentences.");
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
      loadDecks();
    } catch (err) {
      setError(err instanceof ToolError ? err.message : "Making cards failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setRemoving((s) => new Set(s).add(id));
    try {
      await callTool("delete_card", { card_id: id });
      window.setTimeout(() => setCards((cs) => cs.filter((c) => c.id !== id)), 400);
      loadDecks();
    } catch (err) {
      setRemoving((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      setError(err instanceof ToolError ? err.message : "Deleting failed. Try again.");
    }
  };

  const shown = cards.filter((c) => !removing.has(c.id)).length;

  return (
    <div className="page">
      <header className="page-head rise">
        <h1 className="page-title">Add notes</h1>
        <p className="page-lede">Paste them, snap a photo, or upload a PDF, Word file or slide deck. Viva turns them into questions you answer out loud.</p>
      </header>

      {busy && <WritingCards />}

      {deck && !busy && (
        <section className="made rise" aria-labelledby="made-title">
          <div className="made-head">
            <h2 id="made-title" className="section-title">
              {shown} {shown === 1 ? "card" : "cards"} from {deck.title}
            </h2>
            <p className="muted">
              Read them over and delete any that miss the point.{deck.truncated ? " Your notes were long, so only the first part was used." : ""}
            </p>
          </div>
          <ol className="card-list">
            {cards.map((c, i) => (
              <li key={c.id} className={`card-item${removing.has(c.id) ? " is-removing" : ""}`} style={{ ["--i" as string]: i }}>
                <span className="card-num" aria-hidden="true">
                  {i + 1}
                </span>
                <div className="card-body">
                  <p className="card-front">{c.front}</p>
                  <p className="card-back">{c.back}</p>
                  <p className="card-topic">{c.topic}</p>
                </div>
                <button type="button" className="icon-button" onClick={() => void remove(c.id)} aria-label={`Delete card: ${c.front}`}>
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ol>
          <div className="row-actions">
            <Link className="button" href={`/?deck=${deck.deck_id}`} transitionTypes={["nav-back"]}>
              Start quiz
              <ArrowIcon className="button-icon" />
            </Link>
            <button type="button" className="text-button" onClick={() => setDeck(null)}>
              Add more notes
            </button>
          </div>
        </section>
      )}

      {!deck && !busy && (
        <form className="notes-form rise" style={{ ["--d" as string]: "60ms" }} onSubmit={submit}>
          <div className="segmented" role="tablist" aria-label="Where your notes come from" style={{ ["--seg" as string]: SOURCES.findIndex((s) => s.key === source) }}>
            <span className="segmented-indicator" aria-hidden="true" />
            {SOURCES.map(({ key, label, Icon }) => (
              <button key={key} type="button" role="tab" aria-selected={source === key} className="segmented-option" onClick={() => setSource(key)}>
                <Icon className="segmented-icon" />
                {label}
              </button>
            ))}
          </div>

          {source === "paste" && (
            <label className="field">
              <span className="visually-hidden">Notes</span>
              <textarea
                className="ruled"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={11}
                placeholder="Paste your notes here."
              />
              <span className="field-hint">
                <span className={text.length > NOTES_LIMIT ? "over" : ""}>{text.length.toLocaleString("en-US")}</span> / 24,000 characters
              </span>
            </label>
          )}
          {source === "photo" && (
            <PhotoImport
              pending={pendingPhoto}
              onPendingTaken={() => setPendingPhoto(null)}
              onText={(t) => applyText(t, "Read from your photo. Fix anything I got wrong, then make cards.")}
              onError={setError}
            />
          )}
          {source === "file" && <FileDrop reading={readingFile} onFile={(f) => void onFile(f)} />}

          {info && source === "paste" && <p className="info">{info}</p>}

          <div className="field-row">
            <label className="field">
              <span>Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Cell biology, chapter 3" maxLength={120} />
            </label>
            <label className="field">
              <span>Exam date (optional)</span>
              <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
            </label>
          </div>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="button button-wide">
            Make cards
          </button>
        </form>
      )}

      <DeckList decks={decks} onChange={loadDecks} />
    </div>
  );
}

/** Downscale a photo in the browser so it uploads fast and fits the request limit. */
async function photoToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("unreadable");
  const max = 1800;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const q of [0.82, 0.7, 0.55]) {
    const url = canvas.toDataURL("image/jpeg", q);
    if (url.length < 3_000_000) return url;
  }
  throw new Error("too-large");
}

function PhotoImport({
  pending,
  onPendingTaken,
  onText,
  onError,
}: {
  pending: File | null;
  onPendingTaken: () => void;
  onText: (t: string) => void;
  onError: (e: string | null) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // An image dropped on the File tab is handed over here.
  useEffect(() => {
    if (!pending) return;
    onPendingTaken();
    void pick(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    onError(null);
    let url: string;
    try {
      url = await photoToDataUrl(file);
    } catch {
      return onError("I couldn't open that image. Try a JPEG or PNG photo (some phones save HEIC; change the camera format to Most compatible).");
    }
    setPreview(url);
    setReading(true);
    try {
      const r = await callTool<NotesPhoto>("read_notes_photo", { image: url });
      onText(r.text);
    } catch (err) {
      onError(err instanceof ToolError ? err.message : "Reading the photo failed. Try again.");
    } finally {
      setReading(false);
    }
  };

  return (
    <div className="dropzone">
      {preview ? (
        <div className={`photo-preview${reading ? " is-reading" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Your notes" />
          {reading && <span className="scan-line" aria-hidden="true" />}
        </div>
      ) : (
        <CameraIcon className="dropzone-icon" />
      )}
      <p className="dropzone-title">{reading ? "Reading your handwriting…" : "Take a photo of your notes"}</p>
      <p className="muted small">Lay the page flat in good light, and fill the frame.</p>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="visually-hidden"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button type="button" className="button" onClick={() => input.current?.click()} disabled={reading}>
        <CameraIcon className="button-icon" />
        {preview ? "Take another" : "Take photo"}
      </button>
    </div>
  );
}

function FileDrop({ reading, onFile }: { reading: string | null; onFile: (f: File | undefined) => void }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      className={`dropzone${over ? " is-over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFile(e.dataTransfer.files[0]);
      }}
    >
      {reading ? (
        <div className="file-reading" aria-hidden="true">
          <FileIcon className="dropzone-icon" />
          <span className="scan-line" />
        </div>
      ) : (
        <FileIcon className="dropzone-icon" />
      )}
      <p className="dropzone-title" role={reading ? "status" : undefined}>
        {reading ? `Reading ${reading}…` : "Upload your study files"}
      </p>
      <p className="muted small">PDF, Word, PowerPoint (with speaker notes), Excel, OpenDocument, RTF, web pages, text and Markdown. Photos work too.</p>
      <input
        ref={input}
        type="file"
        accept={`${ACCEPT},image/*`}
        className="visually-hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button type="button" className="button button-ghost" onClick={() => input.current?.click()} disabled={!!reading}>
        Choose file
      </button>
    </div>
  );
}

function DeckList({ decks, onChange }: { decks: Deck[] | null; onChange: () => void }) {
  return (
    <section className="decks rise" style={{ ["--d" as string]: "120ms" }} aria-labelledby="decks-title">
      <h2 id="decks-title" className="section-title">
        Your decks
      </h2>
      {decks == null ? (
        <LineSkeleton label="Loading your decks" width="14em" />
      ) : decks.length === 0 ? (
        <p className="muted">No decks yet. Your first one appears here.</p>
      ) : (
        <ul className="deck-list">
          {decks.map((d, i) => (
            <DeckRow key={d.id} deck={d} index={i} onChange={onChange} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DeckRow({ deck, index, onChange }: { deck: Deck; index: number; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = examLabel(deck.exam_date);

  const save = async (date: string) => {
    if (!date) return;
    setSaving(true);
    setError(null);
    try {
      await callTool("set_exam_date", { deck_id: deck.id, date });
      setEditing(false);
      onChange();
    } catch (err) {
      setError(err instanceof ToolError ? err.message : "Saving failed. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="deck-row" style={{ ["--i" as string]: index }}>
      <div className="deck-main">
        <p className="deck-title">{deck.title}</p>
        <p className="deck-meta">
          {deck.card_count} cards · {deck.due_count} due
          {label && (
            <span className="chip chip-paper">
              <CalendarIcon className="chip-icon" />
              {label}
            </span>
          )}
        </p>
        {editing ? (
          <label className="deck-date">
            <span className="visually-hidden">Exam date for {deck.title}</span>
            <input type="date" defaultValue={deck.exam_date ?? ""} onChange={(e) => void save(e.target.value)} disabled={saving} autoFocus />
            <button type="button" className="text-button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </label>
        ) : (
          <button type="button" className="text-button small-button" onClick={() => setEditing(true)}>
            {deck.exam_date ? "Change exam date" : "Add exam date"}
          </button>
        )}
        {error && <p className="error small">{error}</p>}
      </div>
      <Link className="deck-go" href={`/?deck=${deck.id}`} transitionTypes={["nav-back"]} aria-label={`Quiz ${deck.title}`}>
        <ArrowIcon />
      </Link>
    </li>
  );
}
