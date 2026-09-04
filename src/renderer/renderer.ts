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
let playbackGeneration = 0;
let preferredVoiceName = "";
let preparationRequestId = 0;
let clipboardRequestId = 0;
let clarificationRequestId = 0;
let lastSelectionStart = textArea.selectionStart;
let lastSelectionEnd = textArea.selectionEnd;

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
  const currentValue = voiceSelect.value || preferredVoiceName;
  const voices = window.speechSynthesis.getVoices();
  voiceSelect.replaceChildren(new Option("System default", ""));

  voices.forEach((availableVoice) => {
    voiceSelect.add(new Option(`${availableVoice.name} (${availableVoice.lang})`, availableVoice.name));
  });

  voiceSelect.value = currentValue;
}

function stopReading(resetPosition = true): void {
  playbackGeneration += 1;
  window.speechSynthesis.cancel();
  isReading = false;
  isPaused = false;
  if (resetPosition) {
    sentenceIndex = 0;
  }
  updatePlaybackButtons();
}

function replaceReaderText(value: string): void {
  preparationRequestId += 1;
  stopReading();
  sentences = [];
  textArea.value = value;
  clarifyPanelElement.hidden = true;
  updatePlaybackButtons();
  updateSelectionState();
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
  const utteranceGeneration = playbackGeneration;
  utterance.rate = Number(speedInput.value);
  const selectedVoice = window.speechSynthesis.getVoices().find((candidate) => candidate.name === voiceSelect.value);
  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }

  utterance.onend = () => {
    if (utteranceGeneration === playbackGeneration && isReading && !isPaused) {
      sentenceIndex += 1;
      speakNextSentence();
    }
  };
  utterance.onerror = () => {
    if (utteranceGeneration === playbackGeneration && isReading) {
      stopReading(false);
      setStatus("Reed could not continue speaking. Try a different system voice.");
    }
  };

  setStatus(`Listening to sentence ${sentenceIndex + 1} of ${sentences.length}.`);
  window.speechSynthesis.speak(utterance);
}

async function startOrResumeReading(): Promise<void> {
  const requestId = ++preparationRequestId;
  let prepared;
  try {
    prepared = await window.reed.prepareReaderText(textArea.value);
  } catch {
    if (requestId === preparationRequestId) {
      setStatus("Reed could not prepare that text. Please try again.");
    }
    return;
  }

  if (requestId !== preparationRequestId) {
    return;
  }

  if (!prepared.ok) {
    setStatus(prepared.message);
    return;
  }

  textArea.value = prepared.text;
  sentences = prepared.sentences;
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
  const requestId = ++clarificationRequestId;
  let result;
  try {
    result = await window.reed.lookupDefinition(selection);
  } catch {
    if (requestId === clarificationRequestId) {
      clarifyResultElement.textContent = "Reed could not open the offline dictionary. Please try again.";
    }
    return;
  }

  if (requestId !== clarificationRequestId) {
    return;
  }

  if (!result.ok) {
    clarifyResultElement.textContent = result.message;
    return;
  }

  clarifyResultElement.textContent = `“${result.displayTerm}” means ${result.definition} (${result.source}).`;
}

async function loadCopiedText(): Promise<void> {
  const requestId = ++clipboardRequestId;
  preparationRequestId += 1;
  let result;
  try {
    result = await window.reed.requestCopiedText();
  } catch {
    if (requestId === clipboardRequestId) {
      setStatus("Reed could not access copied text. Paste it into the Station instead.");
    }
    return;
  }

  if (requestId !== clipboardRequestId) {
    return;
  }

  if (!result.ok) {
    setStatus(result.message);
    return;
  }

  replaceReaderText(result.text);
  setStatus(result.wasTruncated ? "Reed loaded the first 50,000 characters to protect performance." : "Copied text loaded into Reed Station.");
}

function updateSelectionState(): void {
  if (textArea.selectionStart !== lastSelectionStart || textArea.selectionEnd !== lastSelectionEnd) {
    clarificationRequestId += 1;
    lastSelectionStart = textArea.selectionStart;
    lastSelectionEnd = textArea.selectionEnd;
  }
  clarifyButton.disabled = textArea.selectionStart === textArea.selectionEnd;
}

function preferencesForSave(): { voiceName: string; playbackRate: number } {
  return {
    voiceName: voiceSelect.value,
    playbackRate: Number(speedInput.value)
  };
}

async function loadPreferences(): Promise<void> {
  try {
    const preferences = await window.reed.getPreferences();
    speedInput.value = String(preferences.playbackRate);
    speedOutput.value = `${preferences.playbackRate.toFixed(1)}×`;
    preferredVoiceName = preferences.voiceName;
    populateVoices();
  } catch {
    setStatus("Reed could not load saved preferences, so it is using the defaults.");
  }
}

async function savePreferences(): Promise<void> {
  try {
    const result = await window.reed.savePreferences(preferencesForSave());
    if (!result.ok) {
      setStatus(result.message);
    }
  } catch {
    setStatus("Reed could not save that preference locally.");
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
  preparationRequestId += 1;
  stopReading();
  setStatus("Stopped. You can start again whenever you are ready.");
});
repeatSentenceButton.addEventListener("click", () => {
  if (sentences.length === 0) {
    return;
  }

  stopReading(false);
  isPaused = false;
  isReading = true;
  speakNextSentence();
  updatePlaybackButtons();
});
clarifySelectionButton.addEventListener("click", () => void explainSelectedText());
clearButton.addEventListener("click", () => {
  clipboardRequestId += 1;
  replaceReaderText("");
  setStatus("Reed Station is clear. Nothing from this reading was saved.");
});
textArea.addEventListener("select", updateSelectionState);
textArea.addEventListener("input", () => {
  preparationRequestId += 1;
  if (isReading || isPaused || sentences.length > 0) {
    stopReading();
    sentences = [];
    updatePlaybackButtons();
    setStatus("Text changed. Start listening to hear the updated version.");
  }
  updateSelectionState();
});
textArea.addEventListener("keyup", updateSelectionState);
speedInput.addEventListener("input", () => {
  speedOutput.value = `${Number(speedInput.value).toFixed(1)}×`;
});
speedInput.addEventListener("change", () => void savePreferences());
voiceSelect.addEventListener("change", () => {
  preferredVoiceName = voiceSelect.value;
  void savePreferences();
});

window.reed.onCopiedText((result) => {
  clipboardRequestId += 1;
  preparationRequestId += 1;
  if (!result.ok) {
    setStatus(result.message);
    return;
  }

  replaceReaderText(result.text);
  setStatus(result.wasTruncated ? "Reed loaded the first 50,000 characters from the clipboard." : "Copied text loaded. Press Start listening when ready.");
  startReadingButton.focus();
});

window.reed.onShortcutUnavailable(() => {
  setStatus("The Read copied text shortcut is busy. Use the button in Reed Station instead.");
});

async function initializeApp(): Promise<void> {
  window.speechSynthesis.onvoiceschanged = populateVoices;
  populateVoices();
  await loadPreferences();
  updatePlaybackButtons();
  updateSelectionState();
  window.reed.reportReady();
}

void initializeApp();
