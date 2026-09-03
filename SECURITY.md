# Security policy

## Supported development version

Security fixes are applied to the current development version of Reed before any public release.

## Reporting a concern

Until a public repository exists, report potential security concerns directly to the project owner. Do not include real passwords, access tokens, personal course materials, or screenshots containing sensitive information.

## Design boundaries

Reed is intentionally local-first. It does not send reading material to a server or provide general filesystem access to its interface. Any future cloud or local-model feature must be opt-in, document exactly what content it receives, and add dedicated tests before release.
