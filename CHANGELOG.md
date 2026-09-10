# Changelog

All notable changes to Reed will be recorded here using semantic versioning.

## Browser pilot - 2026-09-10

- Added a separate static browser Station for Mac and Windows browser testing: paste/sample, local-only voice selection, playback controls, progress, and clear.
- Shared the race-safe playback controller with the desktop interface while preserving its clipboard and offline dictionary bridge.
- Added browser preference/privacy tests and Chromium/WebKit interface regressions, including delayed voice discovery and stale speech callbacks.
- Added an owner-only manual GitHub Pages publishing workflow with exact-commit verification and restricted deployment permissions.
- Published desktop installer version remains 0.1.0; this web pilot does not replace or update that release. Real Mac sound/background/VoiceOver testing remains pending.

## [0.1.0] - 2026-09-08

### Added

- Private Reed Station for pasted or explicitly copied text.
- Local system speech with pause, resume, stop, repeat, voice, and speed controls.
- Offline WordNet clarification for selected English words and short phrases.
- Secret-shaped input refusal and local-only preference storage.
- Automated unit, integration, startup, and dependency-security checks.
- Free unsigned 64-bit Windows installer with per-user installation and a published SHA-256 checksum.
- Automated security-fuse, packaged-startup, installation, shortcut, registration, and uninstall verification before release.
- English-only Electron runtime packaging with an automated check to prevent unnecessary installer-size regressions.
