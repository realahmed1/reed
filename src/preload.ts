import { contextBridge, ipcRenderer } from "electron";
import type { TextInputResult } from "./core/text";
import type { ReaderPreferences } from "./core/preferences";

type CopiedTextListener = (result: TextInputResult) => void;
type DefinitionResult =
  | { ok: true; displayTerm: string; definition: string; source: string }
  | { ok: false; message: string };

contextBridge.exposeInMainWorld("reed", {
  requestCopiedText: (): Promise<TextInputResult> => ipcRenderer.invoke("reader:request-copied-text"),
  prepareReaderText: (value: string): Promise<TextInputResult> => ipcRenderer.invoke("reader:prepare-text", value),
  getPreferences: (): Promise<ReaderPreferences> => ipcRenderer.invoke("settings:get"),
  savePreferences: (preferences: ReaderPreferences): Promise<{ ok: true; preferences: ReaderPreferences } | { ok: false; message: string }> => ipcRenderer.invoke("settings:save", preferences),
  lookupDefinition: (selectedValue: string): Promise<DefinitionResult> => ipcRenderer.invoke("clarify:lookup-definition", selectedValue),
  reportReady: (): void => ipcRenderer.send("app:renderer-ready"),
  onCopiedText: (listener: CopiedTextListener): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, result: TextInputResult) => listener(result);
    ipcRenderer.on("reader:copied-text", handler);
    return () => ipcRenderer.removeListener("reader:copied-text", handler);
  },
  onShortcutUnavailable: (listener: () => void): (() => void) => {
    ipcRenderer.once("reader:shortcut-unavailable", listener);
    return () => ipcRenderer.removeListener("reader:shortcut-unavailable", listener);
  }
});
