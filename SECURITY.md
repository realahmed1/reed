# Security policy

## Supported development version

Security fixes are applied to the current development version of Reed before any public release.

## Reporting a concern

Use GitHub’s private security-advisory form for this repository. Do not open a public issue or include real passwords, access tokens, personal course materials, or screenshots containing sensitive information.

## Design boundaries

Reed is intentionally local-first. It does not send reading material to a server or provide general filesystem access to its interface. Any future cloud or local-model feature must be opt-in, document exactly what content it receives, and add dedicated tests before release.

Speech playback uses the operating system’s selected voice. Reed does not provide an upload service, but users should choose an offline-installed system voice when handling sensitive material.

Production builds disable Electron’s Node runtime, `NODE_OPTIONS`, and command-line inspector fuses, and require validated application code from the packaged ASAR. The file-protocol compatibility fuse remains enabled because Reed’s isolated local renderer currently loads from `file://`; navigation, network connections, permissions, Node integration, and unexpected IPC senders remain blocked separately.

## Verifying downloads

Official installers are published only at `https://github.com/realahmed1/reed/releases`. Each release includes `SHA256SUMS.txt`; compare its value with PowerShell’s `Get-FileHash` output before opening an installer.

Version `0.1.0` is unsigned, so Windows cannot confirm a trusted software publisher and may show a SmartScreen warning. A matching checksum proves that the downloaded bytes match the file published in the official release, but it is not a substitute for paid code signing. Reed does not automatically download or install updates.
