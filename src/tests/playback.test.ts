import assert from "node:assert/strict";
import test from "node:test";
import { PlaybackController, PlaybackSnapshot, SpeechDriver } from "../core/playback";
import { MAX_READER_CHARACTERS, MAX_SPEECH_CHUNK_CHARACTERS } from "../core/text";

class FakeSpeechDriver implements SpeechDriver {
  readonly calls: { text: string; onEnd(): void; onError(): void }[] = [];
  pauses = 0;
  resumes = 0;
  cancellations = 0;
  throwsOn: "speak" | "pause" | "resume" | "cancel" | undefined;
  onCancel?: () => void;
  onPause?: () => void;

  speak(text: string, callbacks: { onEnd(): void; onError(): void }): void {
    if (this.throwsOn === "speak") throw new Error("Speech unavailable");
    this.calls.push({ text, ...callbacks });
  }
  pause(): void {
    this.pauses += 1;
    if (this.throwsOn === "pause") throw new Error("Pause unavailable");
    this.onPause?.();
  }
  resume(): void {
    this.resumes += 1;
    if (this.throwsOn === "resume") throw new Error("Resume unavailable");
  }
  cancel(): void {
    this.cancellations += 1;
    if (this.throwsOn === "cancel") throw new Error("Cancel unavailable");
    this.onCancel?.();
  }
}

function setup() {
  const driver = new FakeSpeechDriver();
  const changes: PlaybackSnapshot[] = [];
  const player = new PlaybackController(driver, (snapshot) => changes.push(snapshot));
  return { driver, changes, player };
}

test("playback advances once per sentence and finishes on the last index", () => {
  const { driver, player, changes } = setup();
  assert.deepEqual(player.snapshot, { status: "idle", index: 0, total: 0 });
  player.start(["First.", "Second."]);
  assert.equal(driver.calls[0].text, "First.");
  driver.calls[0].onEnd();
  assert.deepEqual(player.snapshot, { status: "playing", index: 1, total: 2 });
  driver.calls[0].onEnd();
  driver.calls[0].onError();
  assert.equal(driver.calls.length, 2);
  driver.calls[1].onEnd();
  assert.deepEqual(player.snapshot, { status: "finished", index: 1, total: 2 });
  assert.equal(changes.length, 3);
});

test("pause and resume are idempotent and do not enqueue duplicate speech", () => {
  const { driver, player } = setup();
  player.pause();
  player.resume();
  player.start(["First."]);
  player.pause();
  player.pause();
  assert.equal(player.snapshot.status, "paused");
  player.resume();
  player.resume();
  assert.equal(player.snapshot.status, "playing");
  assert.equal(driver.pauses, 1);
  assert.equal(driver.resumes, 1);
  assert.equal(driver.calls.length, 1);
});

test("completion during pause waits for resume then starts the next sentence", () => {
  const { driver, player } = setup();
  player.start(["First.", "Second."]);
  player.pause();
  driver.calls[0].onEnd();
  driver.calls[0].onEnd();
  assert.equal(driver.calls.length, 1);
  assert.deepEqual(player.snapshot, { status: "paused", index: 0, total: 2 });
  player.resume();
  assert.equal(driver.calls[1].text, "Second.");
  assert.equal(driver.resumes, 1);
  assert.deepEqual(player.snapshot, { status: "playing", index: 1, total: 2 });
});

test("synchronous completion inside pause resumes without getting stuck", () => {
  const { driver, player } = setup();
  player.start(["Final."]);
  driver.onPause = () => driver.calls[0].onEnd();
  player.pause();
  assert.equal(player.snapshot.status, "paused");
  player.resume();
  assert.deepEqual(player.snapshot, { status: "finished", index: 0, total: 1 });
});

test("stop invalidates stale callbacks before cancel and retains the list at index zero", () => {
  const { driver, player } = setup();
  player.start(["First.", "Second."]);
  driver.calls[0].onEnd();
  driver.onCancel = () => {
    driver.calls[1].onEnd();
    driver.calls[1].onError();
  };
  player.stop();
  assert.deepEqual(player.snapshot, { status: "idle", index: 0, total: 2 });
  player.repeat();
  assert.equal(driver.calls[2].text, "First.");
});

test("rapid starts ignore end and error events from replaced sessions", () => {
  const { driver, player } = setup();
  for (let index = 0; index < 20; index += 1) player.start([`Passage ${index}.`]);
  for (const call of driver.calls.slice(0, -1)) {
    call.onEnd();
    call.onError();
  }
  assert.equal(driver.calls.length, 20);
  assert.deepEqual(player.snapshot, { status: "playing", index: 0, total: 1 });
  driver.calls[19].onEnd();
  assert.equal(player.snapshot.status, "finished");
});

test("repeat cancels the old utterance and ignores its delayed events", () => {
  const { driver, player } = setup();
  player.start(["First.", "Second."]);
  player.repeat();
  driver.calls[0].onEnd();
  driver.calls[0].onError();
  assert.equal(driver.calls.length, 2);
  assert.equal(driver.calls[1].text, "First.");
  driver.calls[1].onEnd();
  assert.equal(driver.calls[2].text, "Second.");
});

test("repeat after completion repeats the last sentence", () => {
  const { driver, player } = setup();
  player.start(["First.", "Last."]);
  driver.calls[0].onEnd();
  driver.calls[1].onEnd();
  player.repeat();
  assert.equal(driver.calls[2].text, "Last.");
  assert.deepEqual(player.snapshot, { status: "playing", index: 1, total: 2 });
});

test("clear releases the repeat list and ignores callbacks from cleared text", () => {
  const { driver, player } = setup();
  player.start(["Practice."]);
  player.clear();
  driver.calls[0].onEnd();
  driver.calls[0].onError();
  player.repeat();
  assert.equal(driver.calls.length, 1);
  assert.deepEqual(player.snapshot, { status: "idle", index: 0, total: 0 });
});

test("speech error cancels playback and permits a fresh session", () => {
  const { driver, player } = setup();
  player.start(["First.", "Second."]);
  driver.calls[0].onError();
  driver.calls[0].onEnd();
  assert.equal(player.snapshot.status, "error");
  assert.equal(driver.calls.length, 1);
  player.start(["Retry."]);
  assert.equal(player.snapshot.status, "playing");
  assert.equal(driver.calls[1].text, "Retry.");
});

for (const operation of ["speak", "pause", "resume", "cancel"] as const) {
  test(`${operation} failures become an error state rather than escaping`, () => {
    const { driver, player } = setup();
    if (operation !== "speak") player.start(["Practice."]);
    if (operation === "resume") player.pause();
    driver.throwsOn = operation;
    assert.doesNotThrow(() => {
      if (operation === "speak") player.start(["Practice."]);
      if (operation === "pause") player.pause();
      if (operation === "resume") player.resume();
      if (operation === "cancel") player.stop();
    });
    assert.equal(player.snapshot.status, "error");
    driver.calls[0]?.onEnd();
    assert.equal(player.snapshot.status, "error");
  });
}

test("start clones input and public snapshots cannot change the internal state", () => {
  const { driver, player, changes } = setup();
  const sentences = ["First.", "Second."];
  player.start(sentences);
  sentences[1] = "Changed.";
  sentences.push("Extra.");
  player.snapshot.index = 99;
  changes[0].total = 99;
  driver.calls[0].onEnd();
  assert.equal(driver.calls[1].text, "Second.");
  assert.deepEqual(player.snapshot, { status: "playing", index: 1, total: 2 });
});

test("empty input cancels existing speech and remains idle", () => {
  const { driver, player } = setup();
  player.start(["First."]);
  player.start([" ", ""]);
  driver.calls[0].onEnd();
  assert.deepEqual(player.snapshot, { status: "idle", index: 0, total: 0 });
});

test("unprepared oversized input is bounded and synchronous completion does not recurse", () => {
  const calls: string[] = [];
  const driver: SpeechDriver = {
    speak(text, callbacks) { calls.push(text); callbacks.onEnd(); },
    pause() {}, resume() {}, cancel() {}
  };
  const player = new PlaybackController(driver, () => {});
  player.start(["x".repeat(MAX_READER_CHARACTERS + 10)]);
  assert.equal(calls.reduce((total, sentence) => total + sentence.length, 0), MAX_READER_CHARACTERS);
  assert.ok(calls.every((sentence) => sentence.length <= MAX_SPEECH_CHUNK_CHARACTERS));
  assert.equal(player.snapshot.status, "finished");
  player.start(Array.from({ length: MAX_READER_CHARACTERS }, () => "a"));
  assert.equal(player.snapshot.status, "finished");
  assert.equal(player.snapshot.total, MAX_READER_CHARACTERS);
});

test("dispose cancels, releases text, and prevents all future events and commands", () => {
  const { driver, player, changes } = setup();
  player.start(["Practice."]);
  const notifications = changes.length;
  player.dispose();
  const cancellations = driver.cancellations;
  driver.calls[0].onEnd();
  driver.calls[0].onError();
  player.start(["Later."]);
  player.pause();
  player.resume();
  player.stop();
  player.clear();
  player.repeat();
  player.dispose();
  assert.equal(changes.length, notifications);
  assert.equal(driver.cancellations, cancellations);
  assert.equal(driver.calls.length, 1);
  assert.deepEqual(player.snapshot, { status: "idle", index: 0, total: 0 });
});

test("dispose tolerates an unavailable driver without further notifications", () => {
  const { driver, player, changes } = setup();
  driver.throwsOn = "cancel";
  assert.doesNotThrow(() => player.dispose());
  assert.equal(player.snapshot.status, "error");
  assert.equal(changes.length, 0);
});
