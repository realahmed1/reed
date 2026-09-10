import assert from "node:assert/strict";
import test from "node:test";
import { BROWSER_PREFERENCES_KEY, createBrowserServices } from "../browser/services";
import { DEFAULT_READER_PREFERENCES, type ReaderPreferences } from "../core/preferences";
import { MAX_READER_CHARACTERS, MAX_SPEECH_CHUNK_CHARACTERS } from "../core/text";

function memoryStorage(initialValue: string | null = null) {
  const values = new Map<string, string>();
  if (initialValue !== null) {
    values.set(BROWSER_PREFERENCES_KEY, initialValue);
  }
  return {
    values,
    getItem(key: string): string | null {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      values.set(key, value);
    }
  };
}

test("browser services explicitly require local voices and manual paste", () => {
  const services = createBrowserServices();

  assert.deepEqual(services.capabilities, {
    clipboard: false,
    clarification: false,
    localVoicesOnly: true
  });
});

test("browser preferences use defaults when storage is empty", async () => {
  const storage = memoryStorage();
  const services = createBrowserServices(() => storage);

  assert.deepEqual(await services.getPreferences(), DEFAULT_READER_PREFERENCES);
  assert.equal(storage.values.size, 0);
});

test("browser preferences recover from a denied storage getter without breaking text preparation", async () => {
  const services = createBrowserServices(() => {
    throw new Error("Synthetic denied storage access");
  });

  assert.deepEqual(await services.getPreferences(), DEFAULT_READER_PREFERENCES);
  const saved = await services.savePreferences({ voiceName: "Local test voice", playbackRate: 1.2 });
  assert.equal(saved.ok, false);
  if (!saved.ok) {
    assert.match(saved.message, /keep listening/);
    assert.doesNotMatch(saved.message, /Synthetic/);
  }
  assert.equal((await services.prepareReaderText("This passage still works.")).ok, true);
});

test("browser preferences recover from storage read and write failures", async () => {
  const services = createBrowserServices(() => ({
    getItem() {
      throw new Error("Synthetic read failure");
    },
    setItem() {
      throw new Error("Synthetic full storage");
    }
  }));

  assert.deepEqual(await services.getPreferences(), DEFAULT_READER_PREFERENCES);
  const saved = await services.savePreferences(DEFAULT_READER_PREFERENCES);
  assert.equal(saved.ok, false);
  if (!saved.ok) {
    assert.doesNotMatch(saved.message, /Synthetic/);
  }
});

test("browser preferences normalize corrupt and unsupported stored values", async () => {
  for (const value of ["{not json", "null", "[]", "42", '"wrong type"', '{"voiceName":42,"playbackRate":9}']) {
    const services = createBrowserServices(() => memoryStorage(value));
    assert.deepEqual(await services.getPreferences(), DEFAULT_READER_PREFERENCES);
  }
});

test("browser preferences persist only normalized voice and speed fields", async () => {
  const storage = memoryStorage();
  const services = createBrowserServices(() => storage);
  const candidate = {
    voiceName: "Local test voice",
    playbackRate: 1.4,
    passage: "Private practice passage that must not be saved.",
    email: "synthetic@example.invalid",
    history: ["Old sample text"]
  };

  const saved = await services.savePreferences(candidate);

  assert.deepEqual(saved, {
    ok: true,
    preferences: { voiceName: "Local test voice", playbackRate: 1.4 }
  });
  assert.deepEqual([...storage.values.keys()], [BROWSER_PREFERENCES_KEY]);
  assert.deepEqual(JSON.parse(storage.values.get(BROWSER_PREFERENCES_KEY)!), {
    voiceName: "Local test voice",
    playbackRate: 1.4
  });
  assert.deepEqual(await services.getPreferences(), saved.ok ? saved.preferences : null);
});

test("browser preferences do not return unexpected fields from stored data", async () => {
  const storage = memoryStorage('{"voiceName":"Local test voice","playbackRate":1.2,"passage":"Private sample","__proto__":{"injected":true}}');
  const services = createBrowserServices(() => storage);

  assert.deepEqual(await services.getPreferences(), {
    voiceName: "Local test voice",
    playbackRate: 1.2
  });
});

test("browser preferences sanitize unsupported save values", async () => {
  const storage = memoryStorage();
  const services = createBrowserServices(() => storage);
  const invalid = { voiceName: "x".repeat(201), playbackRate: Number.NaN } as ReaderPreferences;

  assert.deepEqual(await services.savePreferences(invalid), {
    ok: true,
    preferences: DEFAULT_READER_PREFERENCES
  });
  assert.deepEqual(await services.getPreferences(), DEFAULT_READER_PREFERENCES);
});

test("browser text preparation keeps hostile markup as text and never accesses storage", async () => {
  let storageAccesses = 0;
  const services = createBrowserServices(() => {
    storageAccesses += 1;
    return memoryStorage();
  });
  const value = '<img src="https://example.invalid/pixel" onerror="alert(1)"> This is literal sample text.';

  const result = await services.prepareReaderText(value);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.text, value);
  }
  assert.equal(storageAccesses, 0);
});

test("browser text preparation preserves the shared privacy guards and 50,000 character cap", async () => {
  const services = createBrowserServices();

  assert.equal((await services.prepareReaderText(" ")).ok, false);
  assert.equal((await services.prepareReaderText("123456")).ok, false);
  assert.equal((await services.prepareReaderText(`Practice note with sk-${"a".repeat(24)} embedded.`)).ok, false);

  const result = await services.prepareReaderText("a".repeat(MAX_READER_CHARACTERS + 10));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.text.length, MAX_READER_CHARACTERS);
    assert.equal(result.wasTruncated, true);
    assert.ok(result.sentences.every((sentence) => sentence.length <= MAX_SPEECH_CHUNK_CHARACTERS));
  }
});

test("browser clipboard and dictionary requests fail clearly without accessing storage", async () => {
  let storageAccesses = 0;
  const services = createBrowserServices(() => {
    storageAccesses += 1;
    return memoryStorage();
  });

  const clipboard = await services.requestCopiedText();
  assert.equal(clipboard.ok, false);
  if (!clipboard.ok) {
    assert.match(clipboard.message, /Paste text/);
  }
  const definition = await services.lookupDefinition("cognitive");
  assert.equal(definition.ok, false);
  if (!definition.ok) {
    assert.match(definition.message, /not available/);
  }
  assert.equal(storageAccesses, 0);
});

test("browser subscriptions and readiness reporting are harmless no-ops", () => {
  const services = createBrowserServices();
  let listenerCalls = 0;
  const onCopy = services.onCopiedText(() => { listenerCalls += 1; });
  const onShortcut = services.onShortcutUnavailable(() => { listenerCalls += 1; });

  services.reportReady();
  onCopy();
  onCopy();
  onShortcut();
  onShortcut();

  assert.equal(listenerCalls, 0);
});
