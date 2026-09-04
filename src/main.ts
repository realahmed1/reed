import { app, BrowserWindow, clipboard, globalShortcut, ipcMain } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import wordnet = require("wordnet");
import { conciseDefinition, prepareClarificationTerm } from "./core/clarify";
import { DEFAULT_READER_PREFERENCES, normalizeReaderPreferences, type ReaderPreferences } from "./core/preferences";
import { prepareCopiedText, prepareReaderText } from "./core/text";

let mainWindow: BrowserWindow | null = null;
let dictionaryInitialization: Promise<void> | null = null;
let preferenceWriteQueue: Promise<void> = Promise.resolve();
const isSmokeTest = process.env.REED_SMOKE_TEST === "1";
const WINDOWS_APP_ID = "io.github.realahmed1.reed";

if (process.platform === "win32") {
  app.setAppUserModelId(WINDOWS_APP_ID);
}

if (isSmokeTest) {
  app.disableHardwareAcceleration();
}

function isMainWindowSender(sender: Electron.WebContents): boolean {
  return mainWindow !== null && sender.id === mainWindow.webContents.id;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 740,
    minWidth: 360,
    minHeight: 560,
    title: "Reed",
    backgroundColor: "#f7f8f5",
    show: !isSmokeTest,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  void mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  mainWindow.webContents.session.setPermissionCheckHandler(() => false);
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function readCopiedText(): Promise<ReturnType<typeof prepareReaderText>> {
  return prepareCopiedText(() => clipboard.readText());
}

function initializeDictionary(): Promise<void> {
  dictionaryInitialization ??= wordnet.init();
  return dictionaryInitialization;
}

function preferencesPath(): string {
  return path.join(app.getPath("userData"), "reader-preferences.json");
}

async function loadPreferences(): Promise<ReaderPreferences> {
  try {
    return normalizeReaderPreferences(JSON.parse(await readFile(preferencesPath(), "utf8")));
  } catch {
    return { ...DEFAULT_READER_PREFERENCES };
  }
}

async function savePreferences(value: unknown): Promise<ReaderPreferences> {
  const preferences = normalizeReaderPreferences(value);
  const pendingWrite = preferenceWriteQueue
    .catch(() => undefined)
    .then(() => writeFile(preferencesPath(), JSON.stringify(preferences), { encoding: "utf8", mode: 0o600 }));
  preferenceWriteQueue = pendingWrite;
  await pendingWrite;
  return preferences;
}

app.whenReady().then(() => {
  ipcMain.on("app:renderer-ready", (event) => {
    if (!isMainWindowSender(event.sender)) {
      return;
    }

    if (isSmokeTest) {
      console.info("REED_SMOKE_READY");
      app.quit();
    }
  });

  createWindow();

  ipcMain.handle("reader:request-copied-text", (event) => {
    if (!isMainWindowSender(event.sender)) {
      throw new Error("Untrusted IPC sender.");
    }

    return readCopiedText();
  });

  ipcMain.handle("reader:prepare-text", (event, value: unknown) => {
    if (!isMainWindowSender(event.sender)) {
      throw new Error("Untrusted IPC sender.");
    }

    if (typeof value !== "string") {
      return { ok: false, message: "Reed received invalid reader text." };
    }

    return prepareReaderText(value);
  });

  ipcMain.handle("settings:get", async (event) => {
    if (!isMainWindowSender(event.sender)) {
      throw new Error("Untrusted IPC sender.");
    }

    return loadPreferences();
  });

  ipcMain.handle("settings:save", async (event, value: unknown) => {
    if (!isMainWindowSender(event.sender)) {
      throw new Error("Untrusted IPC sender.");
    }

    try {
      return { ok: true, preferences: await savePreferences(value) };
    } catch {
      return { ok: false, message: "Reed could not save that preference locally." };
    }
  });

  ipcMain.handle("clarify:lookup-definition", async (event, selectedValue: unknown) => {
    if (!isMainWindowSender(event.sender)) {
      throw new Error("Untrusted IPC sender.");
    }

    if (typeof selectedValue !== "string") {
      return { ok: false, message: "Reed received an invalid clarification request." };
    }

    const term = prepareClarificationTerm(selectedValue);
    if (!term.ok) {
      return term;
    }

    try {
      await initializeDictionary();
      const definitions = await wordnet.lookup(term.lookupTerm, true);
      const definition = definitions.map(({ glossary }) => conciseDefinition(glossary)).find(Boolean);

      if (!definition) {
        return {
          ok: false,
          message: `Reed could not find an offline definition for “${term.displayTerm}”.`
        };
      }

      return {
        ok: true,
        displayTerm: term.displayTerm,
        definition,
        source: "Offline WordNet dictionary"
      };
    } catch {
      return {
        ok: false,
        message: "Reed’s offline dictionary is temporarily unavailable. No text was sent online."
      };
    }
  });

  const shortcutRegistered = globalShortcut.register("CommandOrControl+Shift+R", () => {
    void readCopiedText().then((result) => {
      mainWindow?.show();
      mainWindow?.focus();
      mainWindow?.webContents.send("reader:copied-text", result);
    });
  });

  if (!shortcutRegistered) {
    mainWindow?.webContents.once("did-finish-load", () => {
      mainWindow?.webContents.send("reader:shortcut-unavailable");
    });
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
