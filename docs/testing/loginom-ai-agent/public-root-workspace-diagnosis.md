# Public root workspace refusal — 2026-09-24

## Confirmed failure

Installed macOS Desktop 0.1.14 rejected `dock_prepare` at
2026-09-24T19:20:22.993Z with `NOT_READY / FOREIGN_PAGE`, phase `page`,
empty trace and `effect_possible: false`. No draft was created by this preparation.
The configured generation URL was `https://app.loginom.ai/?testable=true`.

The installed private login normalizes this public root to `/app/`, preserving
`testable=true`, and completes account verification before starting the bridge.
However, `managed-entry.mjs` passed the original connection URL to the bridge.
Workspace preparation compares both origin and pathname and therefore rejected
the authenticated `/app/` page against the configured `/` path. Its
`authenticated: false` field is the initial value at this early refusal, not
evidence of a rejected password or expired authentication.

HTTP checks confirmed that the public root returns 302 to `/app/`, dropping
the query, while `/app/?testable=true` returns 200. The endpoint migration in
commit `f3fd53b5d` introduced the root default and private-login normalization
without applying the same normalization to the bridge configuration.

## Correction

The managed bridge configuration now uses `loginomAddress(input.connection.url)`,
the same function as private login. Strict foreign-page validation remains intact.
The installed-client workaround is to set the connection URL to
`https://app.loginom.ai/app/` through settings.

The `testable=true` query is added internally, never required in settings.
Public connection views remove it from historical URLs, and new saves omit it
while preserving other query parameters. Historical generation files are unchanged.
The settings regression passed together with all 19 connection-service tests;
Host and Desktop package typechecks passed with Bun 1.3.14.

## Verification and limits

- Compared the relevant installed 0.1.14 implementation with repository sources.
- Ran 55 passing tests: connection-check, start-input and workspace, using the
  installed pinned Node from the runtime package directory.
- Opened an isolated headless bundled Chromium on the real public Loginom 7.4.2
  login page. Running workspace preparation against the original root reproduced
  `NOT_READY / FOREIGN_PAGE`; using the normalized URL reached the expected
  `LOGIN_REQUIRED / AUTHENTICATION_REQUIRED`. Both had no possible effects.
- The isolated browser intentionally had no user credentials. Full authenticated
  scenario creation with the corrected build remains untested.
- No installed files, saved connection settings or active user sessions were
  changed. No replacement release was built or published.
