# Bundled Loginom client and browser executor

- `client/` is the active migrated Dock client. Continue development here; the old repository and Codex/Hermes integrations are migration archives, not runtime dependencies. Preserve source attribution and AGPL notices; see [source map](../../docs/migration/source-map.json).
- `src/managed-entry.mjs` is the supervised entrypoint, `connection-check.mjs` checks a proposed connection, and `resources.mjs` validates the bundled resource tree. Desktop supplies credentials through private IPC.
- Public MCP tools and execution must share the authenticated Playwright context. Do not create a second browser/CDP session: authentication and download handlers depend on context identity.
- The Loginom files folder is `/<username>`. Do not ask for a dataset folder or probe that folder during setup. The password starts empty and has no placeholder.
- Keep original tool validation authoritative. OpenAI schema compatibility is adapted at `../agent/src/provider/transform.ts`; do not weaken runtime action validation to satisfy a model provider. In particular, `validateUiAction` enforces stage/action constraints after structured enum normalization.
- Bundled Node, Playwright/MCP and Chromium must match `../product/loginom-release.json`. Startup must not download npm packages or a browser. Linux sandbox remains enabled; root/`--no-sandbox` are not acceptance workarounds.
- Run relevant Node tests in `client/test`; `bun run test:upstream` runs the broader client suite. Use the pinned Node version. Managed integration checks are under `../desktop/test/loginom` and documented in the [Linux runbook](../../docs/testing/loginom-ai-agent/linux.md).
- Native Windows/macOS resources and acceptance belong to their separate [runbooks](../../docs/testing/loginom-ai-agent/README.md). Linux results do not certify those platforms.
