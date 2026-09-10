import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

// Exercises the actual desktop markup/bundle with a deterministic bridge.
// This complements, not replaces, Electron and packaged startup checks.
async function desktopReader(page) {
  const assets = await Promise.all(["index.html", "renderer.js", "styles.css"].map(async name => [name, await readFile(new URL(`../dist/renderer/${name}`, import.meta.url))]));
  await page.route("http://127.0.0.1:4173/reed/**", async route => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1) || "index.html";
    const asset = assets.find(([key]) => key === name);
    if (!asset) return route.abort();
    await route.fulfill({ body: asset[1], contentType: name.endsWith(".html") ? "text/html" : name.endsWith(".js") ? "text/javascript" : "text/css" });
  });
  await page.addInitScript(() => {
    const state = { calls: [], saved: [], term: "", deferPrepare: false, deferCopy: false, deferDefinition: false, ready: false };
    const prepared = value => ({ ok: true, text: value, sentences: [value], wasTruncated: false });
    window.__desktop = state;
    window.reed = {
      prepareReaderText: async value => state.deferPrepare ? new Promise(resolve => { state.resolvePrepare = () => resolve(prepared(value)); }) : prepared(value),
      requestCopiedText: async () => state.deferCopy ? new Promise(resolve => { state.resolveCopy = () => resolve(prepared("Copied practice passage.")); }) : prepared("Copied practice passage."),
      getPreferences: async () => ({ voiceName: "Desktop local", playbackRate: 1.3 }),
      savePreferences: async preferences => { state.saved.push(preferences); return { ok: true, preferences }; },
      lookupDefinition: async term => {
        state.term = term;
        const result = { ok: true, displayTerm: term, definition: "<strong>a practice definition</strong>", source: "Test dictionary" };
        return state.deferDefinition ? new Promise(resolve => { state.resolveDefinition = () => resolve(result); }) : result;
      },
      reportReady: () => { state.ready = true; },
      onCopiedText: listener => { state.deliverCopied = listener; return () => {}; },
      onShortcutUnavailable: listener => { state.shortcutUnavailable = listener; return () => {}; }
    };
    const synth = new EventTarget();
    Object.assign(synth, {
      paused: false,
      getVoices: () => [{ name: "Desktop local", lang: "en-US", localService: true, default: true }],
      speak: utterance => state.calls.push(utterance.text),
      cancel() {}, pause() { synth.paused = true; }, resume() { synth.paused = false; }
    });
    Object.defineProperty(window, "speechSynthesis", { value: synth });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: class { constructor(text) { this.text = text; } } });
  });
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-reed-ready", "true");
}

test("desktop bridge loads preferences, copied text, and shortcut status without automatic speech", async ({ page }) => {
  await desktopReader(page);
  await expect(page.locator("#speed")).toHaveValue("1.3");
  await expect(page.locator("#voice")).toHaveValue("Desktop local");
  await expect(page.locator("#read-copied-text")).toBeVisible();
  await expect(page.locator("#clarify-selection")).toBeVisible();
  await page.locator("#read-copied-text").click();
  await expect(page.locator("#reader-text")).toHaveValue("Copied practice passage.");
  expect(await page.evaluate(() => window.__desktop.calls)).toEqual([]);
  await page.evaluate(() => window.__desktop.deliverCopied({ ok: true, text: "Shortcut practice passage.", sentences: ["Shortcut practice passage."], wasTruncated: false }));
  await expect(page.locator("#reader-text")).toHaveValue("Shortcut practice passage.");
  await expect(page.locator("#start-reading")).toBeFocused();
  await page.evaluate(() => window.__desktop.shortcutUnavailable());
  await expect(page.locator("#reader-status")).toContainText("shortcut is unavailable");
  await page.locator("#start-reading").click();
  await expect(page.locator("#reader-status")).toContainText("Listening to part 1");
});

test("desktop saves the established preference shape and supports system default", async ({ page }) => {
  await desktopReader(page);
  await page.locator("#voice").selectOption("");
  await expect.poll(() => page.evaluate(() => window.__desktop.saved)).toEqual([{ voiceName: "", playbackRate: 1.3 }]);
});

test("desktop pending preparation cannot restart speech after clear", async ({ page }) => {
  await desktopReader(page);
  await page.evaluate(() => { window.__desktop.deferPrepare = true; });
  await page.locator("#reader-text").fill("Delayed practice passage.");
  await page.locator("#start-reading").click();
  await page.locator("#clear-station").click();
  await page.evaluate(() => window.__desktop.resolvePrepare());
  await expect(page.locator("#reader-text")).toHaveValue("");
  expect(await page.evaluate(() => window.__desktop.calls)).toEqual([]);
});

test("desktop pending copied text cannot overwrite a later edit", async ({ page }) => {
  await desktopReader(page);
  await page.evaluate(() => { window.__desktop.deferCopy = true; });
  await page.locator("#read-copied-text").click();
  await page.locator("#reader-text").fill("Keep this newer practice text.");
  await page.evaluate(() => window.__desktop.resolveCopy());
  await expect(page.locator("#reader-text")).toHaveValue("Keep this newer practice text.");
});

test("desktop selected definitions stay text-only and late results cannot return after clear", async ({ page }) => {
  await desktopReader(page);
  await page.locator("#reader-text").fill("practice");
  await page.locator("#reader-text").selectText();
  await page.locator("#clarify-selection").click();
  await expect(page.locator("#clarify-result")).toContainText("<strong>a practice definition</strong>");
  await expect(page.locator("#clarify-result strong")).toHaveCount(0);
  expect(await page.evaluate(() => window.__desktop.term)).toBe("practice");
  await page.evaluate(() => { window.__desktop.deferDefinition = true; });
  await page.locator("#clarify-selection").click();
  await expect(page.locator("#clarify-result")).toContainText("Looking up");
  await page.locator("#clear-station").click();
  await page.evaluate(() => window.__desktop.resolveDefinition());
  await expect(page.locator("#clarify-panel")).toBeHidden();
  await expect(page.locator("#clarify-result")).toHaveText("");
});
