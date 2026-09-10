import { PlaybackController, type PlaybackSnapshot } from "../core/playback";
import type { ReaderServices } from "../core/reader-services";
import type { TextInputResult } from "../core/text";

const SAMPLE_TEXT = "Take a moment to settle into your reading. Reed turns a passage into short spoken parts, so you can listen at your own pace. Try pausing, changing the speed, or repeating a sentence. When you are finished, clear the Station and paste something of your own.";

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error("Reed could not initialize its reader controls.");
  return element;
}

/** Shared interface; the service boundary keeps desktop permissions out of the web build. */
export function initializeReader(services: ReaderServices): void {
  const text = required<HTMLTextAreaElement>("#reader-text");
  const start = required<HTMLButtonElement>("#start-reading");
  const pause = required<HTMLButtonElement>("#pause-reading");
  const stop = required<HTMLButtonElement>("#stop-reading");
  const repeat = required<HTMLButtonElement>("#repeat-sentence");
  const clear = required<HTMLButtonElement>("#clear-station");
  const status = required<HTMLElement>("#reader-status");
  const speed = required<HTMLInputElement>("#speed");
  const speedValue = required<HTMLOutputElement>("#speed-value");
  const voice = required<HTMLSelectElement>("#voice");
  const copied = document.querySelector<HTMLButtonElement>("#read-copied-text");
  const clarify = document.querySelector<HTMLButtonElement>("#clarify-selection");
  const clarifyPanel = document.querySelector<HTMLElement>("#clarify-panel");
  const clarifyResult = document.querySelector<HTMLElement>("#clarify-result");
  const voiceStatus = document.querySelector<HTMLElement>("#voice-status");
  const progress = document.querySelector<HTMLProgressElement>("#reading-progress");
  const sample = document.querySelector<HTMLButtonElement>("#load-sample");
  const refresh = document.querySelector<HTMLButtonElement>("#refresh-voices");
  const limitNotice = document.querySelector<HTMLElement>("#limit-notice");
  const synth = window.speechSynthesis;
  const supported = !!synth && typeof window.SpeechSynthesisUtterance === "function";
  let activeUtterance: SpeechSynthesisUtterance | null = null;
  let preferredVoiceName = "";
  let voiceChosenByUser = false;
  let preferenceRevision = 0;
  let prepareRevision = 0;
  let clipboardRevision = 0;
  let definitionRevision = 0;
  let lastSelection = "";
  let preferenceWrites: Promise<unknown> = Promise.resolve();
  const setStatus = (message: string) => { status.textContent = message; };

  const voiceKey = (item: SpeechSynthesisVoice): string => item.voiceURI || item.name;
  const findVoice = (available: SpeechSynthesisVoice[], selectedValue: string): SpeechSynthesisVoice | undefined =>
    available.find(item => voiceKey(item) === selectedValue) || available.find(item => item.name === selectedValue);

  function voices(): SpeechSynthesisVoice[] {
    if (!supported) return [];
    try {
      return synth.getVoices().filter(item => !services.capabilities.localVoicesOnly || item.localService === true);
    } catch { return []; }
  }

  function populateVoices(): void {
    const wanted = voiceChosenByUser ? voice.value : preferredVoiceName || voice.value;
    const available = voices();
    voice.replaceChildren();
    if (!services.capabilities.localVoicesOnly) voice.add(new Option("System default", ""));
    for (const item of available) voice.add(new Option(`${item.name} (${item.lang})`, voiceKey(item)));
    const matched = findVoice(available, wanted);
    if (matched) voice.value = voiceKey(matched);
    else if (services.capabilities.localVoicesOnly && available.length) voice.value = voiceKey(available.find(item => item.default) || available[0]);
    if (services.capabilities.localVoicesOnly && !available.length) voice.add(new Option("No local voice available", ""));
    voice.disabled = !supported || (services.capabilities.localVoicesOnly && !available.length);
    start.disabled = !supported;
    if (voiceStatus) voiceStatus.textContent = !supported
      ? "This browser does not support read-aloud. Try a current Safari or Chrome browser."
      : !available.length
        ? "No local voice available yet. Install a system voice or try another browser, then check again. Reed will not switch to an online voice."
        : "Only voices reported as local by your browser are shown. Voice and speed changes apply to the next part.";
  }

  function render(state: PlaybackSnapshot): void {
    const active = state.status === "playing" || state.status === "paused";
    pause.disabled = !active;
    pause.textContent = state.status === "paused" ? "Resume" : "Pause";
    stop.disabled = !active;
    repeat.disabled = !supported || !state.total;
    if (progress) {
      progress.max = state.total || 1;
      progress.value = state.status === "finished" ? state.total : state.index;
      progress.setAttribute("aria-valuetext", state.total ? `${progress.value} of ${state.total} parts complete` : "No reading started");
    }
    if (state.status === "playing") setStatus(`Listening to part ${state.index + 1} of ${state.total}.`);
    if (state.status === "paused") setStatus(`Paused at part ${state.index + 1} of ${state.total}.`);
    if (state.status === "finished") setStatus("Finished reading. Reed has not saved this passage.");
    if (state.status === "error") setStatus("Speech was interrupted or unavailable. Check your voice, then start again or repeat this part.");
  }

  const playback = new PlaybackController({
    speak(value, callbacks) {
      if (!supported) throw new Error("Speech unavailable");
      const selected = voices().find(item => voiceKey(item) === voice.value);
      // Never let the browser silently fall back to a potentially remote default.
      if (services.capabilities.localVoicesOnly && !selected) throw new Error("Local voice unavailable");
      const utterance = new SpeechSynthesisUtterance(value);
      activeUtterance = utterance;
      utterance.rate = Number(speed.value);
      if (selected) utterance.voice = selected;
      utterance.onend = () => {
        if (activeUtterance === utterance) activeUtterance = null;
        callbacks.onEnd();
      };
      utterance.onerror = () => {
        if (activeUtterance === utterance) activeUtterance = null;
        callbacks.onError();
      };
      // cancel() does not consistently reset the engine's paused flag.
      if (synth.paused) synth.resume();
      synth.speak(utterance);
    },
    pause() { synth?.pause(); },
    resume() { synth?.resume(); },
    cancel() { activeUtterance = null; synth?.cancel(); }
  }, render);

  function invalidateDefinition(): void {
    definitionRevision++;
    if (clarifyPanel) clarifyPanel.hidden = true;
    if (clarifyResult) clarifyResult.textContent = "";
  }

  function selectionChanged(): void {
    const selection = `${text.selectionStart}:${text.selectionEnd}`;
    if (selection !== lastSelection) { invalidateDefinition(); lastSelection = selection; }
    if (clarify) clarify.disabled = !services.capabilities.clarification || !text.value.slice(text.selectionStart, text.selectionEnd).trim();
  }

  function replaceText(value: string): void {
    prepareRevision++;
    clipboardRevision++;
    playback.clear();
    text.value = value;
    invalidateDefinition();
    selectionChanged();
    if (sample) sample.disabled = !!value.trim();
    if (limitNotice) limitNotice.hidden = true;
  }

  function showLimit(result: TextInputResult): void {
    if (limitNotice) limitNotice.hidden = !(result.ok && result.wasTruncated);
  }

  start.addEventListener("click", () => {
    const revision = ++prepareRevision;
    const accept = (result: TextInputResult) => {
      if (revision !== prepareRevision) return;
      if (!result.ok) { playback.clear(); setStatus(result.message); return; }
      text.value = result.text;
      showLimit(result);
      if (services.capabilities.localVoicesOnly && !voices().some(item => voiceKey(item) === voice.value)) {
        playback.clear();
        populateVoices();
        if (!voice.value) { setStatus("No local voice available. Check the voice guidance below, then try again."); return; }
      }
      playback.start(result.sentences);
    };
    try {
      const result = services.prepareReaderText(text.value);
      // Web preparation is synchronous, preserving the click's user activation.
      if (result instanceof Promise) void result.then(accept).catch(() => {
        if (revision === prepareRevision) setStatus("Reed could not prepare this text. Please try again.");
      });
      else accept(result);
    } catch { setStatus("Reed could not prepare this text. Please try again."); }
  });
  pause.addEventListener("click", () => playback.snapshot.status === "paused" ? playback.resume() : playback.pause());
  stop.addEventListener("click", () => { prepareRevision++; playback.stop(); if (playback.snapshot.status !== "error") setStatus("Stopped. Start again when you are ready."); });
  repeat.addEventListener("click", () => { prepareRevision++; playback.repeat(); });
  clear.addEventListener("click", () => { replaceText(""); setStatus("Station cleared. Ready for something new."); text.focus(); });
  sample?.addEventListener("click", () => {
    if (text.value.trim()) return;
    replaceText(SAMPLE_TEXT);
    setStatus("Sample ready. Press Listen to try it.");
    start.focus();
  });
  text.addEventListener("input", () => {
    prepareRevision++;
    clipboardRevision++;
    const hadPlayback = playback.snapshot.total > 0;
    playback.clear();
    invalidateDefinition();
    selectionChanged();
    if (sample) sample.disabled = !!text.value.trim();
    if (limitNotice) limitNotice.hidden = true;
    if (hadPlayback) setStatus("Text changed. Start listening when you are ready.");
  });
  text.addEventListener("select", selectionChanged);
  text.addEventListener("keyup", selectionChanged);

  function savePreferences(): void {
    preferenceRevision++;
    // A speed-only change must not overwrite a saved voice still being discovered.
    const preferences = { voiceName: preferredVoiceName || voice.value, playbackRate: Number(speed.value) };
    preferenceWrites = preferenceWrites.catch(() => undefined)
      .then(() => services.savePreferences(preferences))
      .then(result => { if (!result.ok) setStatus(result.message); })
      .catch(() => setStatus("Your voice and speed work for this session, but could not be saved."));
  }
  speed.addEventListener("input", () => { speedValue.value = `${Number(speed.value).toFixed(1)}×`; preferenceRevision++; });
  speed.addEventListener("change", savePreferences);
  voice.addEventListener("change", () => { voiceChosenByUser = true; preferredVoiceName = voice.value; savePreferences(); });
  refresh?.addEventListener("click", populateVoices);
  synth?.addEventListener("voiceschanged", populateVoices);

  if (copied) copied.hidden = !services.capabilities.clipboard;
  if (clarify) clarify.hidden = !services.capabilities.clarification;
  copied?.addEventListener("click", () => {
    const revision = ++clipboardRevision;
    prepareRevision++;
    void services.requestCopiedText().then(result => {
      if (revision !== clipboardRevision) return;
      if (!result.ok) { setStatus(result.message); return; }
      replaceText(result.text);
      showLimit(result);
      setStatus(result.wasTruncated ? "Loaded the first 50,000 characters. Press Start listening." : "Copied text is ready. Press Start listening.");
    }).catch(() => { if (revision === clipboardRevision) setStatus("Reed could not access copied text. Paste it into the Station instead."); });
  });
  clarify?.addEventListener("click", () => {
    if (!services.capabilities.clarification || !clarifyPanel || !clarifyResult) return;
    const value = text.value.slice(text.selectionStart, text.selectionEnd);
    const revision = ++definitionRevision;
    clarifyPanel.hidden = false;
    clarifyResult.textContent = "Looking up an offline definition…";
    void services.lookupDefinition(value).then(result => {
      if (revision !== definitionRevision) return;
      clarifyResult.textContent = result.ok ? `${result.displayTerm}: ${result.definition} (${result.source})` : result.message;
    }).catch(() => { if (revision === definitionRevision) clarifyResult.textContent = "The definition could not be loaded. Please try again."; });
  });
  const unsubscribeCopied = services.onCopiedText(result => {
    prepareRevision++;
    clipboardRevision++;
    if (!result.ok) { setStatus(result.message); return; }
    replaceText(result.text);
    showLimit(result);
    setStatus(result.wasTruncated ? "Loaded the first 50,000 characters. Press Start listening." : "Copied text is ready. Press Start listening.");
    start.focus();
  });
  const unsubscribeShortcut = services.onShortcutUnavailable(() => setStatus("The copy shortcut is unavailable. Use Read copied text or paste into the Station."));
  window.addEventListener("pagehide", event => {
    replaceText("");
    setStatus("Station cleared after leaving this page. Paste text to start again.");
    if (!event.persisted) {
      playback.dispose();
      unsubscribeCopied();
      unsubscribeShortcut();
      synth?.removeEventListener("voiceschanged", populateVoices);
    }
  });

  populateVoices();
  render(playback.snapshot);
  selectionChanged();
  if (!supported) setStatus("Read-aloud is not supported in this browser. Try Safari or Chrome.");
  const initialRevision = preferenceRevision;
  void services.getPreferences().then(preferences => {
    if (initialRevision !== preferenceRevision) return;
    speed.value = String(preferences.playbackRate);
    speedValue.value = `${preferences.playbackRate.toFixed(1)}×`;
    preferredVoiceName = preferences.voiceName;
    // Prefer the saved voice on initial load, before any user voice choice.
    voice.value = "";
    populateVoices();
  }).catch(() => undefined).finally(() => {
    document.documentElement.dataset.reedReady = "true";
    services.reportReady();
  });
}
