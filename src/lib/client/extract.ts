"use client";

// Turns a study file into plain text in the browser, so only text (never the file) is uploaded.
// Office and OpenDocument files are zip archives of XML; PDFs are read with unpdf, loaded on demand.
import { unzipSync, strFromU8 } from "fflate";

export const MAX_FILE_BYTES = 40 * 1024 * 1024;

export type Extracted = { text: string; kind: string; note?: string };

export class ExtractError extends Error {}

/** Extensions offered in the picker; anything else is still tried as plain text. */
export const ACCEPT = [
  ".pdf",
  ".docx",
  ".pptx",
  ".xlsx",
  ".odt",
  ".odp",
  ".ods",
  ".rtf",
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".tsv",
  ".html",
  ".htm",
  ".json",
  ".tex",
  ".srt",
  ".vtt",
].join(",");

export const IMAGE = /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i;

const ext = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";

export async function extractText(file: File): Promise<Extracted> {
  if (file.size > MAX_FILE_BYTES) throw new ExtractError("That file is over 40 MB. Split it, or export just the part you need.");
  const e = ext(file.name);
  const buf = new Uint8Array(await file.arrayBuffer());

  switch (e) {
    case "docx":
    case "docm":
      return done(fromZipXml(buf, (n) => /^word\/(document|footnotes|endnotes)\.xml$/.test(n), "p"), "Word document");
    case "pptx":
    case "pptm":
      return done(pptx(buf), "PowerPoint deck");
    case "xlsx":
    case "xlsm":
      return done(xlsx(buf), "spreadsheet");
    case "odt":
    case "odp":
    case "ods":
      return done(fromZipXml(buf, (n) => n === "content.xml", "p"), "OpenDocument file");
    case "pdf":
      return pdf(buf);
    case "rtf":
      return done(rtf(strFromU8(buf, true)), "RTF document");
    case "html":
    case "htm":
      return done(htmlText(new TextDecoder().decode(buf)), "web page");
    case "doc":
    case "ppt":
    case "xls":
      throw new ExtractError(`Old .${e} files can't be read here. Open it and save as .${e}x or PDF, then try again.`);
    case "pages":
    case "key":
    case "numbers":
      throw new ExtractError("Apple iWork files can't be read here. Export it as PDF or Word, then try again.");
  }

  // Anything else: accept it if it looks like text.
  if (looksLikeText(buf)) return done(new TextDecoder().decode(buf), "text file");
  throw new ExtractError("I can't read text from that kind of file. Try PDF, Word, PowerPoint, or a text file.");
}

function done(text: string, kind: string, note?: string): Extracted {
  const clean = text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (clean.length < 20) throw new ExtractError(`That ${kind} has almost no text in it. If it's scanned, take a photo of the pages instead.`);
  return { text: clean, kind, note };
}

function looksLikeText(buf: Uint8Array): boolean {
  const sample = buf.subarray(0, 4096);
  let odd = 0;
  for (const b of sample) {
    if (b === 0) return false;
    if (b < 9 || (b > 13 && b < 32)) odd++;
  }
  return odd < sample.length * 0.02;
}

function unzip(buf: Uint8Array, want: (name: string) => boolean): Record<string, Uint8Array> {
  try {
    return unzipSync(buf, { filter: (f) => want(f.name) });
  } catch {
    throw new ExtractError("That file looks damaged or isn't what its name says. Try saving it again.");
  }
}

function parseXml(bytes: Uint8Array): Document {
  return new DOMParser().parseFromString(strFromU8(bytes), "application/xml");
}

/** Text of every paragraph-like element (matched by local name), one per line. */
function paragraphs(doc: Document, local: string): string[] {
  const out: string[] = [];
  for (const p of Array.from(doc.getElementsByTagNameNS("*", local))) {
    // Skip paragraphs nested in another paragraph-like element to avoid duplicates.
    if (p.parentElement?.closest(`*|${local}`)) continue;
    const t = p.textContent?.trim();
    if (t) out.push(t);
  }
  return out;
}

function fromZipXml(buf: Uint8Array, want: (n: string) => boolean, local: string): string {
  const files = unzip(buf, want);
  return Object.keys(files)
    .sort()
    .map((n) => paragraphs(parseXml(files[n]), local).join("\n"))
    .join("\n\n");
}

const num = (n: string) => Number(n.match(/(\d+)\.xml$/)?.[1] ?? 0);

/** Slides in order, each followed by its speaker notes. */
function pptx(buf: Uint8Array): string {
  const files = unzip(buf, (n) => /^ppt\/(slides\/slide|notesSlides\/notesSlide)\d+\.xml$/.test(n));
  const slides = Object.keys(files)
    .filter((n) => n.startsWith("ppt/slides/"))
    .sort((a, b) => num(a) - num(b));
  return slides
    .map((name) => {
      const i = num(name);
      const body = paragraphs(parseXml(files[name]), "p").join("\n");
      const notesFile = files[`ppt/notesSlides/notesSlide${i}.xml`];
      // Notes slides repeat the slide number as a paragraph; drop bare numbers.
      const notes = notesFile ? paragraphs(parseXml(notesFile), "p").filter((t) => !/^\d+$/.test(t)).join("\n") : "";
      return [body, notes && `Speaker notes: ${notes}`].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

/** Spreadsheet cell text from the shared strings table (where nearly all text in .xlsx lives). */
function xlsx(buf: Uint8Array): string {
  const files = unzip(buf, (n) => n === "xl/sharedStrings.xml");
  const shared = files["xl/sharedStrings.xml"];
  if (!shared) return "";
  return paragraphs(parseXml(shared), "si").join("\n");
}

async function pdf(buf: Uint8Array): Promise<Extracted> {
  let text: string;
  let pages = 0;
  try {
    const { getDocumentProxy, extractText: pdfText } = await import("unpdf");
    const doc = await getDocumentProxy(buf);
    pages = doc.numPages;
    const out = await pdfText(doc, { mergePages: false });
    text = (out.text as string[]).join("\n\n");
  } catch (err) {
    if (/password/i.test(String(err))) throw new ExtractError("That PDF is password-protected. Remove the password, then try again.");
    throw new ExtractError("I couldn't open that PDF. Try exporting it again, or upload Word or text instead.");
  }
  return done(text, "PDF", pages ? `${pages} ${pages === 1 ? "page" : "pages"}` : undefined);
}

function rtf(src: string): string {
  return src
    // Header groups hold fonts, colours and metadata, not content.
    .replace(/\{\\(fonttbl|colortbl|stylesheet|info|listtable|listoverridetable|generator)[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, "")
    .replace(/\\par[d]?/g, "\n")
    .replace(/\{\\\*[^{}]*\}/g, "")
    .replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\u(-?\d+)\??/g, (_, n) => String.fromCharCode((Number(n) + 65536) % 65536))
    .replace(/\\[a-z]+-?\d* ?/gi, "")
    .replace(/[{}]/g, "");
}

function htmlText(src: string): string {
  const doc = new DOMParser().parseFromString(src, "text/html");
  doc.querySelectorAll("script,style,noscript,nav,footer").forEach((n) => n.remove());
  doc.querySelectorAll("p,div,li,h1,h2,h3,h4,h5,h6,br,tr").forEach((n) => n.append("\n"));
  return doc.body?.textContent ?? "";
}
