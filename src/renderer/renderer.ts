const readerText = document.querySelector<HTMLTextAreaElement>("#reader-text");
const readCopiedTextButton = document.querySelector<HTMLButtonElement>("#read-copied-text");
const startReadingButton = document.querySelector<HTMLButtonElement>("#start-reading");
const pauseReadingButton = document.querySelector<HTMLButtonElement>("#pause-reading");
const stopReadingButton = document.querySelector<HTMLButtonElement>("#stop-reading");
const repeatSentenceButton = document.querySelector<HTMLButtonElement>("#repeat-sentence");
const clarifySelectionButton = document.querySelector<HTMLButtonElement>("#clarify-selection");
const clearStationButton = document.querySelector<HTMLButtonElement>("#clear-station");
const readerStatus = document.querySelector<HTMLElement>("#reader-status");
const speed = document.querySelector<HTMLInputElement>("#speed");
const speedValue = document.querySelector<HTMLOutputElement>("#speed-value");
const voice = document.querySelector<HTMLSelectElement>("#voice");
const clarifyPanel = document.querySelector<HTMLElement>("#clarify-panel");
const clarifyResult = document.querySelector<HTMLElement>("#clarify-result");

if (!readerText || !readCopiedTextButton || !startReadingButton || !pauseReadingButton || !stopReadingButton || !repeatSentenceButton || !clarifySelectionButton || !clearStationButton || !readerStatus || !speed || !speedValue || !voice || !clarifyPanel || !clarifyResult) {
  throw new Error("Reed could not initialize its reader controls.");
}

const textArea = readerText;
const statusElement = readerStatus;
const readButton = startReadingButton;
const pauseButton = pauseReadingButton;
const stopButton = stopReadingButton;
const repeatButton = repeatSentenceButton;
const clarifyButton = clarifySelectionButton;
const clearButton = clearStationButton;
const voiceSelect = voice;
const speedInput = speed;
const speedOutput = speedValue;
const clarifyPanelElement = clarifyPanel;
const clarifyResultElement = clarifyResult;

let sentences: string[] = [];
let sentenceIndex = 0;
let isReading = false;
let isPaused = false;

function setStatus(message: string): void {
  statusElement.textContent = message;
}

function updatePlaybackButtons(): void {
  stopButton.disabled = !isReading && !isPaused;
  pauseButton.disabled = !isReading && !isPaused;
  pauseButton.textContent = isPaused ? "Resume" : "Pause";
  repeatButton.disabled = sentences.length === 0;
  readButton.textContent = "Start listening";
}

function populateVoices(): void {
  const currentValue = voiceSelect.value;
  const voices = window.speechSynthesis.getVoices();
  voiceSelect.replaceChildren(new Option("System default", ""));

  voices.forEach((availableVoice) => {
    voiceSelect.add(new Option(`${availableVoice.name} (${availableVoice.lang})`, availableVoice.name));
  });

  voiceSelect.value = currentValue;
}

function splitForSpeech(value: string): string[] {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
    return Array.from(segmenter.segment(normalized), ({ segment }) => segment.trim()).filter(Boolean);
  }

  return normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
}

function stopReading(resetPosition = true): void {
  window.speechSynthesis.cancel();
  isReading = false;
  isPaused = false;
  if (resetPosition) {
    sentenceIndex = 0;
  }
  updatePlaybackButtons();
}

function speakNextSentence(): void {
  if (!isReading || sentenceIndex >= sentences.length) {
    isReading = false;
    sentenceIndex = 0;
    setStatus("Finished reading. Your text remains only in this session.");
    updatePlaybackButtons();
    return;
  }

  const utterance = new SpeechSynthesisUtterance(sentences[sentenceIndex]);
  utterance.rate = Number(speedInput.value);
  const selectedVoice = window.speechSynthesis.getVoices().find((candidate) => candidate.name === voiceSelect.value);
  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }

  utterance.onend = () => {
    if (isReading && !isPaused) {
      sentenceIndex += 1;
      speakNextSentence();
    }
  };
  utterance.onerror = () => {
    if (isReading) {
      stopReading(false);
      setStatus("Reed could not continue speaking. Try a different system voice.");
    }
  };

  setStatus(`Listening to sentence ${sentenceIndex + 1} of ${sentences.length}.`);
  window.speechSynthesis.speak(utterance);
}

async function startOrResumeReading(): Promise<void> {
  const prepared = await window.reed.prepareReaderText(textArea.value);
  if (!prepared.ok) {
    setStatus(prepared.message);
    return;
  }

  textArea.value = prepared.text;
  sentences = splitForSpeech(prepared.text);
  sentenceIndex = 0;
  if (sentences.length === 0) {
    setStatus("Paste text or use Read copied text first.");
    return;
  }

  stopReading(false);
  isReading = true;
  speakNextSentence();
  updatePlaybackButtons();
}

async function explainSelectedText(): Promise<void> {
  const selection = textArea.value.slice(textArea.selectionStart, textArea.selectionEnd).trim();
  if (!selection) {
    setStatus("Select a word or short phrase in Reed Station first.");
    return;
  }

  clarifyPanelElement.hidden = false;
  clarifyResultElement.textContent = "Looking up an offline definition…";
  const result = await window.reed.lookupDefinition(selection);

  if (!result.ok) {
    clarifyResultElement.textContent = result.message;
    return;
  }

  clarifyResultElement.textContent = `“${result.displayTerm}” means ${result.definition} (${result.source}).`;
}

async function loadCopiedText(): Promise<void> {
  const result = await window.reed.requestCopiedText();
  if (!result.ok) {
    setStatus(result.message);
    return;
  }

  textArea.value = result.text;
  setStatus(result.wasTruncated ? "Reed loaded the first 50,000 characters to protect performance." : "Copied text loaded into Reed Station.");
  clarifyPanelElement.hidden = true;
}

function updateSelectionState(): void {
  clarifyButton.disabled = textArea.selectionStart === textArea.selectionEnd;
}

function preferencesForSave(): { voiceName: string; playbackRate: number } {
  return {
    voiceName: voiceSelect.value,
    playbackRate: Number(speedInput.value)
  };
}

async function loadPreferences(): Promise<void> {
  const preferences = await window.reed.getPreferences();
  speedInput.value = String(preferences.playbackRate);
  speedOutput.value = `${preferences.playbackRate.toFixed(1)}×`;
  voiceSelect.value = preferences.voiceName;
}

async function savePreferences(): Promise<void> {
  const result = await window.reed.savePreferences(preferencesForSave());
  if (!result.ok) {
    setStatus(result.message);
  }
}

readCopiedTextButton.addEventListener("click", () => void loadCopiedText());
startReadingButton.addEventListener("click", () => void startOrResumeReading());
pauseReadingButton.addEventListener("click", () => {
  if (!isReading && !isPaused) {
    return;
  }

  if (isPaused) {
    window.speechSynthesis.resume();
    isPaused = false;
    setStatus("Listening resumed.");
  } else {
    window.speechSynthesis.pause();
    isPaused = true;
    setStatus("Listening paused.");
  }
  updatePlaybackButtons();
});
stopReadingButton.addEventListener("click", () => {
  stopReading();
  setStatus("Stopped. You can start again whenever you are ready.");
});
repeatSentenceButton.addEventListener("click", () => {
  if (sentences.length === 0) {
    return;
  }

  window.speechSynthesis.cancel();
  isPaused = false;
  isReading = true;
  speakNextSentence();
  updatePlaybackButtons();
});
clarifySelectionButton.addEventListener("click", () => void explainSelectedText());
clearButton.addEventListener("click", () => {
  stopReading();
  textArea.value = "";
  clarifyPanelElement.hidden = true;
  setStatus("Reed Station is clear. Nothing from this reading was saved.");
  updateSelectionState();
});
textArea.addEventListener("select", updateSelectionState);
textArea.addEventListener("keyup", updateSelectionState);
speedInput.addEventListener("input", () => {
  speedOutput.value = `${Number(speedInput.value).toFixed(1)}×`;
});
speedInput.addEventListener("change", () => void savePreferences());
voiceSelect.addEventListener("change", () => void savePreferences());

window.reed.onCopiedText((result) => {
  if (!result.ok) {
    setStatus(result.message);
    return;
  }

  textArea.value = result.text;
  clarifyPanelElement.hidden = true;
  setStatus(result.wasTruncated ? "Reed loaded the first 50,000 characters from the clipboard." : "Copied text loaded. Press Start listening when ready.");
  startReadingButton.focus();
});

window.reed.onShortcutUnavailable(() => {
  setStatus("The Read copied text shortcut is busy. Use the button in Reed Station instead.");
});

window.speechSynthesis.onvoiceschanged = populateVoices;
populateVoices();
void loadPreferences();
updatePlaybackButtons();
updateSelectionState();
