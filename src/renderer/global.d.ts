import type { TextInputResult } from "../core/text";
import type { ReaderPreferences } from "../core/preferences";

declare global {
  interface Window {
    reed: {
      requestCopiedText(): Promise<TextInputResult>;
      prepareReaderText(value: string): Promise<TextInputResult>;
      getPreferences(): Promise<ReaderPreferences>;
      savePreferences(preferences: ReaderPreferences): Promise<
        | { ok: true; preferences: ReaderPreferences }
        | { ok: false; message: string }
      >;
      lookupDefinition(selectedValue: string): Promise<
        | { ok: true; displayTerm: string; definition: string; source: string }
        | { ok: false; message: string }
      >;
      onCopiedText(listener: (result: TextInputResult) => void): () => void;
      onShortcutUnavailable(listener: () => void): () => void;
    };
  }
}

export {};
