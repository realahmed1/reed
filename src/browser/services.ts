import { normalizeReaderPreferences } from "../core/preferences";
import type { ReaderServices } from "../core/reader-services";
import { prepareReaderText } from "../core/text";

export const BROWSER_PREFERENCES_KEY = "reed.browser.preferences.v1";

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

/** The browser adapter never reads the clipboard or persists reading passages. */
export function createBrowserServices(
  getStorage: () => PreferenceStorage = () => window.localStorage
): ReaderServices {
  return {
    capabilities: {
      clipboard: false,
      clarification: false,
      localVoicesOnly: true
    },
    prepareReaderText,
    async requestCopiedText() {
      return {
        ok: false,
        message: "Reed Web cannot import copied text automatically. Paste text into the Station instead."
      };
    },
    async getPreferences() {
      try {
        const saved = getStorage().getItem(BROWSER_PREFERENCES_KEY);
        return normalizeReaderPreferences(saved === null ? null : JSON.parse(saved));
      } catch {
        return normalizeReaderPreferences(null);
      }
    },
    async savePreferences(preferences) {
      try {
        const normalized = normalizeReaderPreferences(preferences);
        getStorage().setItem(BROWSER_PREFERENCES_KEY, JSON.stringify(normalized));
        return { ok: true, preferences: normalized };
      } catch {
        return {
          ok: false,
          message: "Reed could not save your voice and speed preferences in this browser. You can keep listening without saving them."
        };
      }
    },
    async lookupDefinition() {
      return {
        ok: false,
        message: "Word clarification is not available in Reed Web yet. Your selection has not been sent anywhere."
      };
    },
    reportReady() {},
    onCopiedText() {
      return () => {};
    },
    onShortcutUnavailable() {
      return () => {};
    }
  };
}
