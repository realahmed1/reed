import { MAX_READER_CHARACTERS, splitIntoSentences } from "./text";

export interface SpeechDriver {
  speak(text: string, callbacks: { onEnd(): void; onError(): void }): void;
  pause(): void;
  resume(): void;
  cancel(): void;
}

export interface PlaybackSnapshot {
  status: "idle" | "playing" | "paused" | "finished" | "error";
  index: number;
  total: number;
}

/** A shared, DOM-free speech queue. It never persists or logs reading text. */
export class PlaybackController {
  private sentences: string[] = [];
  private state: PlaybackSnapshot = { status: "idle", index: 0, total: 0 };
  private generation = 0;
  private boundaryPending = false;
  private speechQueued = false;
  private pumping = false;
  private disposed = false;

  constructor(private readonly driver: SpeechDriver, private readonly onChange: (snapshot: PlaybackSnapshot) => void) {}

  get snapshot(): PlaybackSnapshot {
    return { ...this.state };
  }

  start(sentences: string[]): void {
    if (this.disposed) return;

    // The caller normally supplies prepared text. Bound and clone it again so
    // later caller mutations cannot change the active queue.
    const prepared: string[] = [];
    let remaining = MAX_READER_CHARACTERS;
    for (const sentence of sentences.slice(0, MAX_READER_CHARACTERS)) {
      const text = sentence.slice(0, remaining).trim();
      prepared.push(...splitIntoSentences(text));
      remaining -= text.length;
      if (remaining === 0) break;
    }

    this.invalidate();
    this.sentences = prepared;
    this.state = { status: "idle", index: 0, total: prepared.length };
    if (!this.cancel()) return;
    this.state.status = prepared.length ? "playing" : "idle";
    this.notify();
    if (this.state.status === "playing") this.queueSpeech();
  }

  pause(): void {
    if (this.disposed || this.state.status !== "playing") return;
    // Some speech engines finish an utterance while pause() is being handled.
    this.state.status = "paused";
    try {
      this.driver.pause();
    } catch {
      this.fail();
      return;
    }
    this.notify();
  }

  resume(): void {
    if (this.disposed || this.state.status !== "paused") return;
    this.state.status = "playing";
    if (this.boundaryPending) {
      this.boundaryPending = false;
      // Reset the engine's pause flag before queuing the next utterance.
      try {
        this.driver.resume();
      } catch {
        this.fail();
        return;
      }
      this.advance();
      return;
    }
    try {
      this.driver.resume();
    } catch {
      this.fail();
      return;
    }
    this.notify();
  }

  stop(): void {
    if (this.disposed) return;
    this.invalidate();
    this.state.index = 0;
    if (!this.cancel()) return;
    this.state.status = "idle";
    this.notify();
  }

  clear(): void {
    if (this.disposed) return;
    this.invalidate();
    this.sentences = [];
    this.state = { status: "idle", index: 0, total: 0 };
    if (!this.cancel()) return;
    this.notify();
  }

  repeat(): void {
    if (this.disposed || !this.sentences.length) return;
    this.invalidate();
    if (!this.cancel()) return;
    this.state.status = "playing";
    this.notify();
    this.queueSpeech();
  }

  /** Release text and cancel without notifying an interface being torn down. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.invalidate();
    this.sentences = [];
    this.state = { status: "idle", index: 0, total: 0 };
    try {
      this.driver.cancel();
    } catch {
      this.state.status = "error";
    }
  }

  private invalidate(): void {
    this.generation += 1;
    this.boundaryPending = false;
    this.speechQueued = false;
  }

  private cancel(): boolean {
    try {
      this.driver.cancel();
      return true;
    } catch {
      this.fail();
      return false;
    }
  }

  private fail(): void {
    this.invalidate();
    this.state.status = "error";
    // A failed pause/resume must not leave speech running unnoticed.
    try { this.driver.cancel(); } catch { /* The original failure is shown by state. */ }
    this.notify();
  }

  private notify(): void {
    if (!this.disposed) this.onChange(this.snapshot);
  }

  private advance(): void {
    if (this.state.index + 1 >= this.sentences.length) {
      this.state.status = "finished";
      this.notify();
      return;
    }
    this.state.index += 1;
    this.notify();
    this.queueSpeech();
  }

  private queueSpeech(): void {
    this.speechQueued = true;
    if (this.pumping) return;
    this.pumping = true;
    try {
      // Also supports drivers that complete synchronously, without recursion.
      while (this.speechQueued && !this.disposed && this.state.status === "playing") {
        this.speechQueued = false;
        const token = ++this.generation;
        let settled = false;
        const current = () => !this.disposed && token === this.generation && !settled;
        try {
          this.driver.speak(this.sentences[this.state.index], {
            onEnd: () => {
              if (!current()) return;
              settled = true;
              if (this.state.status === "paused") {
                this.boundaryPending = true;
              } else if (this.state.status === "playing") {
                this.advance();
              }
            },
            onError: () => {
              if (!current()) return;
              settled = true;
              this.fail();
            }
          });
        } catch {
          if (token === this.generation && !this.disposed) this.fail();
        }
      }
    } finally {
      this.pumping = false;
    }
  }
}
