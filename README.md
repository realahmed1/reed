# Reed

Reed is a private, Windows-first listening companion for students who want to hear course material while they keep working. Paste a passage into Reed Station—or copy text in another app and use the global shortcut—and Reed reads it aloud with a selected system voice.

## What works today

- Paste text into **Reed Station** and listen with system voices.
- Copy text from another app, then press `Ctrl + Shift + R` to load it into Reed.
- Pause, resume, stop, repeat the current sentence, and change playback speed.
- Select an English word or short phrase in Reed Station for an **offline WordNet definition**.
- Save only voice and speed preferences locally. Reading text is kept in memory and can be cleared immediately.
- Refuse copied or pasted values that look like passwords, six-digit security codes, or common access tokens.

## Deliberate limitations

Reed does **not** watch the screen, silently copy selections, record audio, keep a reading history, or send text to an online AI service. It currently requires the user to copy source text before using the system-wide shortcut.

Direct selection capture from supported Windows apps and screen-region OCR are future improvements. A richer study assistant will be offered only as an explicitly enabled local-model integration; it is not bundled today.

## Install on Windows

1. Open the [Reed releases page](https://github.com/realahmed1/reed/releases) and choose `v0.1.0`.
2. Download `Reed-Setup-0.1.0-x64.exe` and `SHA256SUMS.txt`.
3. In PowerShell, verify the installer before opening it:

   ```powershell
   Get-FileHash .\Reed-Setup-0.1.0-x64.exe -Algorithm SHA256
   ```

   The result must match the value in `SHA256SUMS.txt`.
4. Open the installer. Reed installs only for the current Windows user and does not require administrator access.

Version `0.1.0` is intentionally unsigned to keep the pilot free. Windows SmartScreen may therefore show **Windows protected your PC**. Verify the checksum and confirm that the download came from `github.com/realahmed1/reed` before choosing **More info** and **Run anyway**. Do not install copies shared through another website or file-hosting service.

Reed has no automatic updater. Future versions will be announced on the releases page so that each update remains an explicit user choice.

## Run locally

Requirements: Node.js 24 or newer on Windows.

```powershell
npm install
npm run dev
```

To use another app’s text: select it, copy it with `Ctrl + C`, then press `Ctrl + Shift + R`. Reed opens with that copied text. If the shortcut is already used by another program, use **Read copied text** inside Reed Station instead.

## Checks

```powershell
npm run typecheck
npm test
npm run smoke
npm audit --audit-level=high
```

`npm test` covers text validation, secret-shaped input refusal, sentence chunking, offline clarification, and local preference validation. `npm run smoke` launches the desktop app invisibly, confirms the secured window loads, then closes it.

`npm run package:win` creates the unsigned 64-bit Windows installer. `npm run package:smoke` checks the packaged security fuses, verifies that only the intended Electron language files were bundled, and launches the unpacked application invisibly. `npm run installer:smoke` refuses to replace an existing Reed installation, then installs, launches, and uninstalls the exact release artifact while checking its shortcuts and registration.

## Security and privacy model

- Electron renderer isolation, sandboxing, and a restrictive Content Security Policy are enabled.
- The interface has no direct Node.js access. It gets a small, validated set of actions through a preload bridge.
- All permission requests, pop-up windows, and user-initiated navigations are denied.
- No account, telemetry, remote API, or background screen capture exists in this version.
- Preferences are stored locally; reading material is not written to disk by Reed.

Reed itself has no upload service. Speech synthesis is provided by the selected operating-system voice, so users handling sensitive material should choose a voice installed for offline use.

Clipboard text has no trustworthy source metadata, so Reed cannot prove that it did not come from a secure field. The secret-shape guard is a safeguard, not a replacement for user judgment: never copy passwords, recovery codes, financial data, or private credentials into Reed.

## Architecture

```text
Windows clipboard / pasted text
        │
        ▼
Electron main process ── validates text and privacy safeguards
        │ narrow IPC bridge
        ▼
Reed Station renderer ── local Web Speech playback and controls
        │ selected term only
        ▼
Offline WordNet dictionary
```

## Pilot plan

Test with 5–10 volunteers using real course readings. Ask only for consented task success, a 1–5 usefulness rating, and short feedback. Do not collect course content, screenshots, recordings, or reading history.

## GitHub safeguards

Every code commit must use Ismaila Ahmed’s verified GitHub identity. The included verification workflow has read-only repository permission: it can test and report issues, but cannot commit, merge, publish, or deploy. It repeats the full verification monthly and reports when dependency updates are available. Dependabot **alerts** may be enabled, but automated version-update pull requests stay disabled so `@realahmed1` remains the sole code contributor.

Release files are published manually by `@realahmed1`. The workflow builds and launches an installer during verification but does not upload it or create GitHub releases.

## Demo script

1. Copy a non-sensitive paragraph from a course page or document.
2. Press `Ctrl + Shift + R` and show it arriving in Reed Station.
3. Start listening, change speed, pause, resume, and repeat a sentence.
4. Select one word and show its offline definition.
5. Show the privacy note and explain that no reading history or online upload exists.
