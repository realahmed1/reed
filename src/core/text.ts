import { detectLikelySensitiveText } from "./sensitive";

export const MAX_READER_CHARACTERS = 50_000;
export const MAX_SPEECH_CHUNK_CHARACTERS = 500;

export type TextInputResult =
  | { ok: true; text: string; sentences: string[]; wasTruncated: boolean }
  | { ok: false; message: string };

export const CLIPBOARD_ACCESS_ERROR = "Reed could not access copied text. Use the Station to paste it instead.";

/**
 * Normalizes user-supplied text before it enters a short-lived reader session.
 * It intentionally does not write input to disk or logs.
 */
export function prepareReaderText(value: string): TextInputResult {
  const normalized = value.replace(/\r\n?/g, "\n").trim();

  if (!normalized) {
    return { ok: false, message: "Copy or paste some text for Reed to read." };
  }

  if (detectLikelySensitiveText(normalized)) {
    return {
      ok: false,
      message: "For your privacy, Reed will not read a likely password, security code, or access token."
    };
  }

  const text = normalized.slice(0, MAX_READER_CHARACTERS);
  return {
    ok: true,
    text,
    sentences: splitIntoSentences(text),
    wasTruncated: normalized.length > MAX_READER_CHARACTERS
  };
}
/** Converts a clipboard read failure into a safe result the interface can show. */
export async function prepareCopiedText(readClipboardText: () => string | Promise<string>): Promise<TextInputResult> {
  try {
    return prepareReaderText(await readClipboardText());
  } catch {
    return { ok: false, message: CLIPBOARD_ACCESS_ERROR };
  }
}

function chunkLongSentence(sentence: string): string[] {
  const chunks: string[] = [];
  let currentChunk = "";

  for (const word of sentence.split(/\s+/)) {
    if (word.length > MAX_SPEECH_CHUNK_CHARACTERS) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = "";
      }

      for (let start = 0; start < word.length; start += MAX_SPEECH_CHUNK_CHARACTERS) {
        chunks.push(word.slice(start, start + MAX_SPEECH_CHUNK_CHARACTERS));
      }
      continue;
    }

    const candidate = currentChunk ? `${currentChunk} ${word}` : word;
    if (candidate.length > MAX_SPEECH_CHUNK_CHARACTERS) {
      chunks.push(currentChunk);
      currentChunk = word;
    } else {
      currentChunk = candidate;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Creates small speech chunks so playback can pause and repeat a sentence.
 */
export function splitIntoSentences(text: string): string[] {
  const compact = text.replace(/\s+/g, " ").trim();

  if (!compact) {
    return [];
  }

  let sentenceSegments: string[];
  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
    sentenceSegments = Array.from(segmenter.segment(compact), ({ segment }) => segment.trim()).filter(Boolean);
  } else {
    sentenceSegments = compact.split(/(?<=[.!?])\s+/).filter(Boolean);
  }

  return sentenceSegments.flatMap(chunkLongSentence);
}
