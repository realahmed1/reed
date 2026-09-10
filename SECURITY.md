# Security policy

## Supported development version

Security fixes are applied to the current development version of Reed before any public release.

## Reporting a concern

Use GitHub’s private security-advisory form for this repository. Do not open a public issue or include real passwords, access tokens, personal course materials, or screenshots containing sensitive information.

## Design boundaries

Reed is intentionally local-first. It does not send reading material to a server or provide general filesystem access to its interface. Any future cloud or local-model feature must be opt-in, document exactly what content it receives, and add dedicated tests before release.

Speech playback uses the operating system’s selected voice. Reed does not provide an upload service, but users should choose an offline-installed system voice when handling sensitive material.

The browser pilot permits only voices explicitly reported as local (`localService === true`) and rechecks the selected voice before each spoken part. It stops with guidance if the local voice becomes unavailable; it does not fall back to a remote voice. This is an API-level safeguard, not independent verification of browser/OS internals.

Browser reading text is neither sent in application requests nor stored in browser storage, URL parameters, or analytics. Only allowlisted voice/speed preferences are persisted, and denied or corrupted storage does not block listening. The static page's Content Security Policy blocks connection requests, inline scripts, object content, workers, and form submissions. Reed disables textarea spellchecking/autocomplete requests; extensions, browser restoration, OS features, and the hosting provider remain outside its control. Clear stops speech and releases the active reading queue; it does not promise forensic erasure from device memory.

GitHub Pages hosts the approved public browser pilot. Its static application code is public and GitHub logs visitor IP addresses for security. Website publication and changes to this privacy model require explicit approval. The manual publishing workflow is restricted to `realahmed1`, `main`, and an exact successfully verified commit. It uploads only the validated static output. Pages write/OIDC permissions exist only in the deployment job, which does not check out or modify source code. Pushes and scheduled checks cannot publish the site.

Production builds disable Electron’s standalone Node mode (`RunAsNode`), `NODE_OPTIONS`, and command-line inspector fuses, and require validated application code from the packaged ASAR. The file-protocol compatibility fuse remains enabled because Reed’s isolated local renderer currently loads from `file://`; navigation, network connections, permissions, Node integration, and unexpected IPC senders remain blocked separately.

## Verifying downloads

Official installers are published only at `https://github.com/realahmed1/reed/releases`. Each release includes `SHA256SUMS.txt`; compare its value with PowerShell’s `Get-FileHash` output before opening an installer.

Version `0.1.0` is unsigned, so Windows cannot confirm a trusted software publisher and may show a SmartScreen warning. A matching checksum proves that the downloaded bytes match the file published in the official release, but it is not a substitute for paid code signing. Reed does not automatically download or install updates.
