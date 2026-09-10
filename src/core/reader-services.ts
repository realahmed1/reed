import type { ReaderPreferences } from "./preferences";
import type { TextInputResult } from "./text";

export type DefinitionResult =
  | { ok: true; displayTerm: string; definition: string; source: string }
  | { ok: false; message: string };

export type SavePreferencesResult =
  | { ok: true; preferences: ReaderPreferences }
  | { ok: false; message: string };

/** Platform capabilities are explicit so the reader never guesses at permissions. */
export interface ReaderServices {
  readonly capabilities: {
    readonly clipboard: boolean;
    readonly clarification: boolean;
    readonly localVoicesOnly: boolean;
  };
  requestCopiedText(): Promise<TextInputResult>;
  prepareReaderText(value: string): TextInputResult | Promise<TextInputResult>;
  getPreferences(): Promise<ReaderPreferences>;
  savePreferences(preferences: ReaderPreferences): Promise<SavePreferencesResult>;
  lookupDefinition(selectedValue: string): Promise<DefinitionResult>;
  reportReady(): void;
  onCopiedText(listener: (result: TextInputResult) => void): () => void;
  onShortcutUnavailable(listener: () => void): () => void;
}
