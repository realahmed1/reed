# Reed v0.1.0

Reed’s first public pilot release is a private Windows listening companion for students who want to hear course material while continuing other work.

## Download

Download both files attached to this release:

- `Reed-Setup-0.1.0-x64.exe`
- `SHA256SUMS.txt`

Verify the installer in PowerShell before opening it:

```powershell
Get-FileHash .\Reed-Setup-0.1.0-x64.exe -Algorithm SHA256
```

The result must match `SHA256SUMS.txt`.

## What is included

- Read pasted text aloud with an installed Windows voice.
- Load explicitly copied text with `Ctrl + Shift + R`.
- Pause, resume, stop, repeat, and adjust playback speed.
- Look up selected English words using the bundled offline WordNet dictionary.
- Keep reading material in memory instead of saving a reading history.
- Refuse common password, security-code, and access-token shapes.

## Important Windows notice

This free pilot installer is unsigned. Windows SmartScreen may show **Windows protected your PC** because Reed does not yet have a paid code-signing certificate. Confirm that the file came from this repository, verify its checksum, then choose **More info** and **Run anyway** if you want to proceed.

The installer is 64-bit, installs for the current Windows user without administrator access, and does not include an automatic updater.

## Known limitations

- Reed reads text only after it is pasted or explicitly copied.
- Direct screen selection capture and OCR are not included yet.
- Voice recording, voice cloning, cloud AI, macOS, and Linux are not included.
- Word explanations use an offline English dictionary rather than a generative AI model.

Please report security concerns through GitHub’s private security-advisory form. Do not attach passwords, tokens, private course material, or sensitive screenshots.
