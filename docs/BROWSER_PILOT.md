# Reed browser pilot

Status: implemented for local testing; **not published**. The existing Windows v0.1.0 release is unchanged. No claim of completed Mac or human pilot testing is made.

## Product boundary

Help a student paste reading material, start listening, and continue another task. This is a browser read-aloud pilot, not a complete AI study assistant or a native Mac app. No sign-in is needed, and browser use does not require an unsigned desktop download. It cannot read arbitrary applications or bypass permissions.

Included: manual paste, synthetic sample, local voices, speed, pause/resume, stop, repeat current spoken part, progress, clear, and session-only reading. Very long sentences are split into parts of at most 500 characters; only the first 50,000 characters of a passage are loaded.

Deferred: WordNet in the browser, cloud explanations, personal voice recording/cloning, OCR, file import, screen capture, background-tab guarantees, offline installation, accounts, and native macOS/Linux releases. Windows keeps its existing clipboard shortcut and offline dictionary.

## Automated release gates

- Type checking and all unit tests, including malformed/denied preferences and queued speech races.
- Browser controls, local-only voice selection, unsupported/empty voice states, stale callbacks, rapid starts, text changes, and errors with deterministic speech mocks.
- Reading text absent from application requests, storage, and URL; no unexpected application resources or desktop dependencies in web output.
- Keyboard and narrow-viewport checks. These are not a full accessibility conformance audit.
- Chromium and WebKit regression suite in read-only CI; Mac Safari speech still requires physical-device testing.
- Windows startup, packaging/fuse checks, and clean-machine install/uninstall regression in CI. Never replace an existing personal Reed installation just to run the installer smoke test.
- Dependency vulnerability review; no known high/critical findings may be ignored without documented assessment.

## Real Mac checklist — pending

Ask 3–5 volunteers with Safari and/or Chrome on their actual Macs. Record browser version, macOS version, chip family if known, and whether a local voice is available. Do not infer support from M4/M5 branding alone.

1. Use the built-in sample first. Can they choose a voice and hear it?
2. Paste a non-sensitive public paragraph. Start, pause, resume, repeat, stop, then clear. Does the behavior match the labels?
3. Change voice/speed and confirm the next part uses the new settings.
4. Listen to a roughly five-minute public passage while using another tab and another app. Record interruptions and recovery steps; do not promise uninterrupted background playback.
5. Close/reopen or reload. The passage should not be retained by Reed; preferences may be retained if storage is allowed.
6. Test keyboard-only use, enlarged text/zoom, and VoiceOver if the volunteer normally uses it. Ask whether focus and status feedback are understandable.
7. Try with the network disconnected after the page has loaded. Record the result, without presenting this as a guarantee that the page can be opened offline.

Outcome to measure: **number of consenting testers who paste a passage, hear it, pause/resume, and clear it without assistance / total testers who attempted that task**. Start with no observations; never substitute automated passes for users. Also collect a short usefulness comment and the most disruptive issue. Avoid course text, account details, screenshots of private content, recordings, or diagnostic reading logs.

## Hosting approval gate

Proposed target: GitHub Pages for `realahmed1/reed`, serving only the four files in `out/web`: `index.html`, `styles.css`, `browser.js`, and `.nojekyll`. Build checks refuse unfamiliar output files. There is no API server or secret configuration to deploy.

Before going live, show the owner the precise target, successful checks, unresolved Mac testing limits, and public-hosting implications. Request a separate explicit approval. Only then configure a protected/manual Pages publication workflow, using immutable action revisions and narrowly scoped publishing permissions. Do not add a bot author, co-author, collaborator, or generated-code commit.

Once published, verify the actual `/reed/` URL, relative assets, HTTPS, CSP, local voices, no unexpected network requests, and one synthetic end-to-end reading. Record the exact source commit and actual URL. Do not publish the desktop release folder or tests.

GitHub Pages is free for public repositories under the current plan; GitHub logs visitor IP addresses for security. See [GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages). Speech voice locality is defined by the [browser API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService).

## Maintenance and evidence

The existing monthly read-only workflow also runs browser checks. Alerts/reporting do not install updates, merge changes, or republish anything. For a reported bug: reproduce with synthetic text, write a regression test, review privacy/Windows impact, run the gates, then explicitly approve publication of the reviewed revision. Keep source, README, tests, and release notes consistent in that change.

Collect actual test logs, source commits, local screenshots of the sample, final build size, and consented task outcomes for the portfolio. A demo should show paste → listen → pause/resume/repeat → clear, then explain why the browser and desktop share playback but not permissions.
