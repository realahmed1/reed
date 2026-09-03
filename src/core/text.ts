export const MAX_READER_CHARACTERS = 50_000;

export type TextInputResult =
  | { ok: true; text: string; wasTruncated: boolean }
  | { ok: false; message: string };

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

  return {
    ok: true,
    text: normalized.slice(0, MAX_READER_CHARACTERS),
    wasTruncated: normalized.length > MAX_READER_CHARACTERS
  };
}

/**
 * Creates small speech chunks so playback can pause and repeat a sentence.
 */
export function splitIntoSentences(text: string): string[] {
  const compact = text.replace(/\s+/g, " ").trim();

  if (!compact) {
    return [];
  }

  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
    return Array.from(segmenter.segment(compact), ({ segment }) => segment.trim()).filter(Boolean);
  }

  return compact.split(/(?<=[.!?])\s+/).filter(Boolean);
}

export function selectedText(value: string, start: number, end: number): string {
  return value.slice(Math.max(0, start), Math.max(start, end)).trim();
}
import { detectLikelySensitiveText } from "./sensitive";

