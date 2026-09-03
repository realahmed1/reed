export interface ReaderPreferences {
  voiceName: string;
  playbackRate: number;
}

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  voiceName: "",
  playbackRate: 1
};

/** Validates the only values Reed keeps between sessions. */
export function normalizeReaderPreferences(value: unknown): ReaderPreferences {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_READER_PREFERENCES };
  }

  const candidate = value as Partial<ReaderPreferences>;
  const voiceName = typeof candidate.voiceName === "string" && candidate.voiceName.length <= 200
    ? candidate.voiceName
    : DEFAULT_READER_PREFERENCES.voiceName;
  const playbackRate = typeof candidate.playbackRate === "number" && candidate.playbackRate >= 0.6 && candidate.playbackRate <= 2
    ? candidate.playbackRate
    : DEFAULT_READER_PREFERENCES.playbackRate;

  return { voiceName, playbackRate };
}

