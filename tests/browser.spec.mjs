import { expect, test } from "@playwright/test";

const FIRST_VOICE = "Reed Test Local One";
const SECOND_VOICE = "Reed Test Local Two";
const FIRST_VOICE_URI = "reed-test-local-one";
const SECOND_VOICE_URI = "reed-test-local-two";
const REMOTE_VOICE = "Reed Test Online";

/**
 * Deterministic speech events test Reed's queue and privacy decisions, not
 * audible quality. Real Safari/Chrome listening remains a separate Mac check.
 */
async function openReader(page, options = {}) {
  await page.addInitScript(({ options, firstVoice, secondVoice, remoteVoice }) => {
    if (options.storage === "denied") {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() { throw new DOMException("Storage unavailable", "SecurityError"); }
      });
    } else if (options.storage === "corrupt") {
      // Every preference read is malformed, independent of the storage key.
      Storage.prototype.getItem = () => "{invalid-json";
    }
    if (options.preferences) localStorage.setItem("reed.browser.preferences.v1", JSON.stringify(options.preferences));

    const duplicateName = "Reed Test Duplicate";
    const localVoices = [
      { name: options.duplicateVoiceNames ? duplicateName : firstVoice, voiceURI: "reed-test-local-one", lang: "en-US", default: true, localService: true },
      { name: options.duplicateVoiceNames ? duplicateName : secondVoice, voiceURI: "reed-test-local-two", lang: "en-US", default: false, localService: true }
    ];
    const remote = { name: remoteVoice, voiceURI: "reed-test-online", lang: "en-US", default: false, localService: false };
    const voicesFor = mode => mode === "none" ? [] : mode === "remote-only" ? [remote] : mode === "first-local" ? [localVoices[0]] : [...localVoices, remote];
    let available = voicesFor(options.voices);
    const synth = new EventTarget();
    const state = {
      calls: [], pauses: 0, resumes: 0, cancellations: 0, maxActive: 0,
      active: new Set(),
      finish(index) {
        state.active.delete(index);
        synth.speaking = state.active.size > 0;
        state.calls[index].utterance.onend?.({ type: "end" });
      },
      fail(index) {
        state.active.delete(index);
        synth.speaking = state.active.size > 0;
        state.calls[index].utterance.onerror?.({ type: "error", error: "synthesis-failed" });
      },
      setVoices(mode, notify = true) {
        available = voicesFor(mode);
        if (notify) {
          synth.dispatchEvent(new Event("voiceschanged"));
          synth.onvoiceschanged?.(new Event("voiceschanged"));
        }
      }
    };
    Object.assign(synth, {
      paused: false,
      speaking: false,
      pending: false,
      getVoices: () => [...available],
      speak(utterance) {
        const index = state.calls.length;
        state.calls.push({ text: utterance.text, rate: utterance.rate, voiceName: utterance.voice?.name, voiceURI: utterance.voice?.voiceURI,
          localService: utterance.voice?.localService, utterance });
        state.active.add(index);
        state.maxActive = Math.max(state.maxActive, state.active.size);
        synth.speaking = true;
      },
      pause() { state.pauses += 1; synth.paused = true; },
      resume() { state.resumes += 1; synth.paused = false; },
      cancel() {
        state.cancellations += 1;
        state.active.clear();
        synth.speaking = false;
        // Deliberately retain paused: cancel does not reliably clear it.
      }
    });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: options.missingAPI ? undefined : synth });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: options.missingAPI ? undefined : class {
        constructor(text) { this.text = text; this.rate = 1; this.voice = null; this.onend = null; this.onerror = null; }
      }
    });
    window.__reedSpeech = state;
  }, { options, firstVoice: FIRST_VOICE, secondVoice: SECOND_VOICE, remoteVoice: REMOTE_VOICE });
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-reed-ready", "true");
}

async function calls(page) {
  return page.evaluate(() => window.__reedSpeech.calls.map(({ text, rate, voiceName, voiceURI, localService }) => ({ text, rate, voiceName, voiceURI, localService })));
}

async function startPassage(page, passage = "First practice sentence. Second practice sentence.") {
  await page.locator("#reader-text").fill(passage);
  await page.locator("#start-reading").click();
  await expect(page.locator("#reader-status")).toContainText("Listening to part 1");
}

test("paste, listen, pause, resume, repeat, stop, and finish form one controllable queue", async ({ page }) => {
  await openReader(page);
  await expect(page.locator("#pause-reading")).toBeDisabled();
  await expect(page.locator("#repeat-sentence")).toBeDisabled();
  await startPassage(page);
  expect((await calls(page))[0]).toMatchObject({ text: "First practice sentence.", voiceName: FIRST_VOICE, localService: true });
  await page.locator("#pause-reading").click();
  await expect(page.locator("#reader-status")).toContainText("Paused at part 1");
  await expect(page.locator("#pause-reading")).toHaveText("Resume");
  await page.locator("#pause-reading").click();
  await expect(page.locator("#reader-status")).toContainText("Listening to part 1");
  expect(await calls(page)).toHaveLength(1);
  await page.locator("#repeat-sentence").click();
  expect((await calls(page))[1].text).toBe("First practice sentence.");
  await page.locator("#stop-reading").click();
  await expect(page.locator("#reader-status")).toContainText("Stopped");
  await expect(page.locator("#pause-reading")).toBeDisabled();
  await page.locator("#repeat-sentence").click();
  await page.evaluate(() => window.__reedSpeech.finish(2));
  await expect(page.locator("#reader-status")).toContainText("Listening to part 2 of 2");
  await page.evaluate(() => window.__reedSpeech.finish(3));
  await expect(page.locator("#reader-status")).toContainText("Finished reading");
  await expect(page.locator("#reading-progress")).toHaveAttribute("aria-valuetext", "2 of 2 parts complete");
  await page.locator("#repeat-sentence").click();
  expect((await calls(page))[4].text).toBe("Second practice sentence.");
  expect(await page.evaluate(() => window.__reedSpeech.maxActive)).toBe(1);
});

test("a part ending during pause waits for resume before advancing", async ({ page }) => {
  await openReader(page);
  await startPassage(page);
  await page.locator("#pause-reading").click();
  await page.evaluate(() => window.__reedSpeech.finish(0));
  await expect(page.locator("#reader-status")).toContainText("Paused at part 1");
  expect(await calls(page)).toHaveLength(1);
  await page.locator("#pause-reading").click();
  await expect(page.locator("#reader-status")).toContainText("Listening to part 2");
  expect(await calls(page)).toHaveLength(2);
  expect(await page.evaluate(() => window.speechSynthesis.paused)).toBe(false);
});

test("clear and replacement invalidate late speech callbacks", async ({ page }) => {
  await openReader(page);
  await startPassage(page);
  await page.locator("#clear-station").click();
  await page.evaluate(() => { window.__reedSpeech.finish(0); window.__reedSpeech.fail(0); });
  await expect(page.locator("#reader-text")).toHaveValue("");
  await expect(page.locator("#reader-status")).toContainText("Station cleared");
  await expect(page.locator("#repeat-sentence")).toBeDisabled();
  await startPassage(page, "A replacement passage.");
  await page.evaluate(() => { window.__reedSpeech.finish(0); window.__reedSpeech.fail(0); });
  await expect(page.locator("#reader-status")).toContainText("Listening to part 1 of 1");
  expect(await calls(page)).toHaveLength(2);
  await page.evaluate(() => window.__reedSpeech.finish(1));
  await expect(page.locator("#reader-status")).toContainText("Finished reading");
});

test("rapid starts and repeat after a paused cancellation never overlap speech", async ({ page }) => {
  await openReader(page);
  await page.locator("#reader-text").fill("A short practice passage.");
  await page.locator("#start-reading").evaluate(button => { for (let index = 0; index < 12; index += 1) button.click(); });
  expect(await calls(page)).toHaveLength(12);
  await page.evaluate(() => { for (let index = 0; index < 11; index += 1) { window.__reedSpeech.finish(index); window.__reedSpeech.fail(index); } });
  await expect(page.locator("#reader-status")).toContainText("Listening to part 1");
  await page.locator("#pause-reading").click();
  await page.locator("#repeat-sentence").click();
  expect(await page.evaluate(() => window.speechSynthesis.paused)).toBe(false);
  expect(await page.evaluate(() => window.__reedSpeech.maxActive)).toBe(1);
  expect(await calls(page)).toHaveLength(13);
});

test("only local voices are offered and selected voice and rate apply to each new part", async ({ page }) => {
  await openReader(page);
  await expect(page.locator("#voice option")).toHaveText([`${FIRST_VOICE} (en-US)`, `${SECOND_VOICE} (en-US)`]);
  await startPassage(page);
  await page.locator("#voice").selectOption(SECOND_VOICE_URI);
  await page.locator("#speed").fill("1.4");
  await page.locator("#speed").dispatchEvent("change");
  await page.evaluate(() => window.__reedSpeech.finish(0));
  expect((await calls(page))[1]).toMatchObject({ rate: 1.4, voiceName: SECOND_VOICE, localService: true });
  expect((await calls(page)).every(call => call.voiceName !== REMOTE_VOICE)).toBe(true);
});

test("voices with the same display name stay selectable by unique identifiers", async ({ page }) => {
  await openReader(page, { duplicateVoiceNames: true });
  await page.locator("#voice").selectOption(SECOND_VOICE_URI);
  await startPassage(page);
  expect((await calls(page))[0]).toMatchObject({ voiceURI: SECOND_VOICE_URI });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("reed.browser.preferences.v1")).voiceName)).toBe(SECOND_VOICE_URI);
});

test("a local voice disappearing between parts cannot trigger an online fallback", async ({ page }) => {
  await openReader(page);
  await startPassage(page);
  await page.evaluate(() => { window.__reedSpeech.setVoices("remote-only", false); window.__reedSpeech.finish(0); });
  await expect(page.locator("#reader-status")).toContainText("Speech was interrupted");
  expect(await calls(page)).toHaveLength(1);
  await expect(page.locator("#pause-reading")).toBeDisabled();
  await page.locator("#refresh-voices").click();
  await expect(page.locator("#voice-status")).toContainText("No local voice");
  await expect(page.locator("#voice")).toBeDisabled();
});

for (const voices of ["none", "remote-only"]) {
  test(`no local voices gives guidance and never speaks (${voices})`, async ({ page }) => {
    await openReader(page, { voices });
    await expect(page.locator("#voice-status")).toContainText("No local voice");
    await page.locator("#reader-text").fill("A practice passage.");
    await page.locator("#start-reading").click();
    await expect(page.locator("#reader-status")).toContainText("No local voice");
    expect(await calls(page)).toHaveLength(0);
    await page.evaluate(() => window.__reedSpeech.setVoices("local"));
    await expect(page.locator("#voice")).toBeEnabled();
    await page.locator("#start-reading").click();
    await expect(page.locator("#reader-status")).toContainText("Listening to part 1");
  });
}

test("missing speech APIs leave a usable text area and clear guidance", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await openReader(page, { missingAPI: true });
  await expect(page.locator("#start-reading")).toBeDisabled();
  await expect(page.locator("#voice-status")).toContainText("does not support read-aloud");
  await page.locator("#load-sample").click();
  await expect(page.locator("#reader-text")).not.toHaveValue("");
  await page.locator("#clear-station").click();
  await expect(page.locator("#reader-text")).toHaveValue("");
  expect(errors).toEqual([]);
});

test("only voice and speed preferences survive reload, never the passage", async ({ page }) => {
  await openReader(page);
  await page.locator("#voice").selectOption(SECOND_VOICE_URI);
  await page.locator("#speed").fill("1.6");
  await page.locator("#speed").dispatchEvent("change");
  await page.locator("#reader-text").fill("A synthetic passage that must not be saved.");
  await expect.poll(() => page.evaluate(() => Object.values(localStorage).some(value => {
    try { return JSON.parse(value).playbackRate === 1.6; } catch { return false; }
  }))).toBe(true);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-reed-ready", "true");
  await expect(page.locator("#voice")).toHaveValue(SECOND_VOICE_URI);
  await expect(page.locator("#speed")).toHaveValue("1.6");
  await expect(page.locator("#reader-text")).toHaveValue("");
  await expect(page.locator("#pause-reading")).toBeDisabled();
});

test("a saved local voice is restored when its delayed voice list arrives", async ({ page }) => {
  await openReader(page, { voices: "first-local", preferences: { voiceName: SECOND_VOICE_URI, playbackRate: 1 } });
  await expect(page.locator("#voice")).toHaveValue(FIRST_VOICE_URI);
  await page.evaluate(() => window.__reedSpeech.setVoices("local"));
  await expect(page.locator("#voice")).toHaveValue(SECOND_VOICE_URI);
});

test("an explicit voice choice wins over a saved voice that arrives later", async ({ page }) => {
  await openReader(page, { voices: "first-local", preferences: { voiceName: SECOND_VOICE_URI, playbackRate: 1 } });
  await page.locator("#voice").selectOption(FIRST_VOICE_URI);
  await page.evaluate(() => window.__reedSpeech.setVoices("local"));
  await expect(page.locator("#voice")).toHaveValue(FIRST_VOICE_URI);
  await startPassage(page);
  expect((await calls(page))[0].voiceName).toBe(FIRST_VOICE);
});

test("changing speed while waiting for a saved voice does not overwrite that voice", async ({ page }) => {
  await openReader(page, { voices: "first-local", preferences: { voiceName: SECOND_VOICE_URI, playbackRate: 1 } });
  await page.locator("#speed").fill("1.5");
  await page.locator("#speed").dispatchEvent("change");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("reed.browser.preferences.v1")).playbackRate)).toBe(1.5);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("reed.browser.preferences.v1")).voiceName)).toBe(SECOND_VOICE_URI);
  await page.evaluate(() => window.__reedSpeech.setVoices("local"));
  await expect(page.locator("#voice")).toHaveValue(SECOND_VOICE_URI);
  await expect(page.locator("#speed")).toHaveValue("1.5");
});

for (const storage of ["denied", "corrupt"]) {
  test(`preference storage ${storage} does not prevent listening`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await openReader(page, { storage });
    await expect(page.locator("#speed")).toHaveValue("1");
    await startPassage(page);
    await page.locator("#speed").fill("1.3");
    await page.locator("#speed").dispatchEvent("change");
    await page.evaluate(() => window.__reedSpeech.finish(0));
    expect((await calls(page))[1].rate).toBe(1.3);
    expect(errors).toEqual([]);
  });
}

test("reading text never enters requests, URLs, console output, or storage", async ({ page }) => {
  const requests = [];
  const messages = [];
  page.on("request", request => requests.push({ url: request.url(), body: request.postData() || "" }));
  page.on("console", message => messages.push(message.text()));
  await openReader(page);
  const passage = "Reed privacy canary amber meadow. This is synthetic reading material.";
  await startPassage(page, passage);
  await page.locator("#pause-reading").click();
  await page.locator("#voice").selectOption(SECOND_VOICE_URI);
  await page.locator("#stop-reading").click();
  const stored = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
  const captured = JSON.stringify({ requests, messages, stored, url: page.url() });
  expect(captured).not.toContain("amber meadow");
  expect(captured).not.toContain(encodeURIComponent(passage));
  expect(requests.every(request => new URL(request.url).origin === "http://127.0.0.1:4173")).toBe(true);
  expect(requests.every(request => !request.body)).toBe(true);
});

test("pasted markup remains plain text and blank text never starts speech", async ({ page }) => {
  await openReader(page);
  await page.locator("#start-reading").click();
  await expect(page.locator("#reader-status")).toContainText("Copy or paste");
  expect(await calls(page)).toHaveLength(0);
  const markup = '<img src="https://reed-invalid.example/passage" onerror="window.reedInjected=true"> A sample sentence.';
  await startPassage(page, markup);
  expect(await page.locator("img").count()).toBe(0);
  expect(await page.evaluate(() => window.reedInjected)).toBeUndefined();
  await expect(page.locator("#reader-text")).toHaveValue(markup);
});

test("speech errors become recoverable messages and stale completion stays ignored", async ({ page }) => {
  await openReader(page);
  await startPassage(page);
  await page.evaluate(() => { window.__reedSpeech.fail(0); window.__reedSpeech.finish(0); });
  await expect(page.locator("#reader-status")).toContainText("Speech was interrupted");
  expect(await calls(page)).toHaveLength(1);
  await page.locator("#repeat-sentence").click();
  await expect(page.locator("#reader-status")).toContainText("Listening to part 1");
  expect(await calls(page)).toHaveLength(2);
});

test("sample and playback work with a keyboard and the narrow layout does not overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openReader(page);
  await page.locator("#load-sample").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#start-reading")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#reader-status")).toContainText("Listening to part 1");
  await page.keyboard.press("Tab");
  await expect(page.locator("#pause-reading")).toBeFocused();
  const focus = await page.locator("#pause-reading").evaluate(button => {
    const style = getComputedStyle(button);
    return { visible: button.matches(":focus-visible"), outlineStyle: style.outlineStyle, outlineWidth: parseFloat(style.outlineWidth) };
  });
  expect(focus.visible).toBe(true);
  expect(focus.outlineStyle).not.toBe("none");
  expect(focus.outlineWidth).toBeGreaterThan(0);
  await page.keyboard.press("Enter");
  await expect(page.locator("#reader-status")).toContainText("Paused at part 1");
  expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= window.innerWidth)).toBe(true);
  await page.locator("#clear-station").click();
  await expect(page.locator("#reader-text")).toBeFocused();
  await expect(page.locator("#load-sample")).toBeEnabled();
});

test("preview serves only public assets, redirects the base path, and rejects writes", async ({ request }) => {
  for (const path of ["/package.json", "/.env", "/src/main.ts", "/reed/../package.json"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
  }
  const redirect = await request.get("/reed", { maxRedirects: 0 });
  expect([301, 302, 307, 308]).toContain(redirect.status());
  expect(redirect.headers().location).toBe("/reed/");
  const write = await request.post("/reed/", { data: "synthetic-rejected-input" });
  expect(write.status()).toBe(405);
});
