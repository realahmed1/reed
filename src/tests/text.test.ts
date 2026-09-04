import assert from "node:assert/strict";
import test from "node:test";
import wordnet = require("wordnet");
import { conciseDefinition, prepareClarificationTerm } from "../core/clarify";
import { DEFAULT_READER_PREFERENCES, normalizeReaderPreferences } from "../core/preferences";
import { CLIPBOARD_ACCESS_ERROR, MAX_READER_CHARACTERS, MAX_SPEECH_CHUNK_CHARACTERS, prepareCopiedText, prepareReaderText, splitIntoSentences } from "../core/text";

test("prepareReaderText rejects blank input", () => {
  assert.deepEqual(prepareReaderText("  \n "), {
    ok: false,
    message: "Copy or paste some text for Reed to read."
  });
});

test("prepareReaderText normalizes Windows line endings", () => {
  assert.deepEqual(prepareReaderText("First\r\nSecond\rThird"), {
    ok: true,
    text: "First\nSecond\nThird",
    sentences: ["First Second Third"],
    wasTruncated: false
  });
});

test("prepareReaderText limits excessively large input", () => {
  const result = prepareReaderText("a".repeat(MAX_READER_CHARACTERS + 10));

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.text.length, MAX_READER_CHARACTERS);
    assert.ok(result.sentences.every((sentence) => sentence.length <= MAX_SPEECH_CHUNK_CHARACTERS));
    assert.equal(result.wasTruncated, true);
  }
});

test("prepareReaderText refuses likely security codes", () => {
  assert.deepEqual(prepareReaderText("123456"), {
    ok: false,
    message: "For your privacy, Reed will not read a likely password, security code, or access token."
  });
});

test("prepareReaderText refuses likely access tokens", () => {
  assert.deepEqual(prepareReaderText(`sk-${"a".repeat(24)}`), {
    ok: false,
    message: "For your privacy, Reed will not read a likely password, security code, or access token."
  });
});

test("prepareReaderText refuses access tokens embedded in other text", () => {
  const result = prepareReaderText(`Notes copied with sk-${"a".repeat(24)} inside them.`);

  assert.deepEqual(result, {
    ok: false,
    message: "For your privacy, Reed will not read a likely password, security code, or access token."
  });
});

test("prepareCopiedText converts clipboard failures into a safe message", async () => {
  const result = await prepareCopiedText(() => {
    throw new Error("Clipboard unavailable");
  });

  assert.deepEqual(result, { ok: false, message: CLIPBOARD_ACCESS_ERROR });
});

test("splitIntoSentences creates independently repeatable speech chunks", () => {
  assert.deepEqual(splitIntoSentences("One sentence. Another question? Final thought!"), [
    "One sentence.",
    "Another question?",
    "Final thought!"
  ]);
});

test("splitIntoSentences limits long utterances for reliable playback", () => {
  const result = splitIntoSentences(Array.from({ length: 180 }, () => "material").join(" "));

  assert.ok(result.length > 1);
  assert.ok(result.every((sentence) => sentence.length <= MAX_SPEECH_CHUNK_CHARACTERS));
});

test("prepareClarificationTerm keeps short English phrases local", () => {
  assert.deepEqual(prepareClarificationTerm("  Cognitive load "), {
    ok: true,
    displayTerm: "Cognitive load",
    lookupTerm: "cognitive_load"
  });
});

test("prepareClarificationTerm rejects non-word input", () => {
  assert.deepEqual(prepareClarificationTerm("https://example.com"), {
    ok: false,
    message: "Reed’s offline dictionary currently supports English words and short phrases."
  });
});

test("conciseDefinition removes examples from an offline dictionary entry", () => {
  assert.equal(conciseDefinition('a mental process; "an illustrative example"'), "a mental process");
});

test("the bundled offline dictionary returns a definition", async () => {
  await wordnet.init();
  const definitions = await wordnet.lookup("cognitive", true);

  assert.ok(definitions.some(({ glossary }) => conciseDefinition(glossary).length > 0));
});

test("reader preferences accept only supported local values", () => {
  assert.deepEqual(normalizeReaderPreferences({ voiceName: "Microsoft Zira", playbackRate: 1.4 }), {
    voiceName: "Microsoft Zira",
    playbackRate: 1.4
  });
});

test("reader preferences fall back when persisted data is malformed", () => {
  assert.deepEqual(normalizeReaderPreferences({ voiceName: "x".repeat(201), playbackRate: 4 }), DEFAULT_READER_PREFERENCES);
});
