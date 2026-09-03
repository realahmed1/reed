# Security policy

## Supported development version

Security fixes are applied to the current development version of Reed before any public release.

## Reporting a concern

Use GitHub’s private security-advisory form for this repository. Do not open a public issue or include real passwords, access tokens, personal course materials, or screenshots containing sensitive information.

## Design boundaries

Reed is intentionally local-first. It does not send reading material to a server or provide general filesystem access to its interface. Any future cloud or local-model feature must be opt-in, document exactly what content it receives, and add dedicated tests before release.

Speech playback uses the operating system’s selected voice. Reed does not provide an upload service, but users should choose an offline-installed system voice when handling sensitive material.
