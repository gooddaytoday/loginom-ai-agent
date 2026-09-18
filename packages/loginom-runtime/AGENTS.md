# Bundled Loginom client and browser executor

- `client/` is the active migrated Dock client. Continue development here; the old repository and Codex/Hermes integrations are migration archives, not runtime dependencies. Preserve source attribution and AGPL notices; see [source map](../../docs/migration/source-map.json).
- `src/managed-entry.mjs` is the supervised entrypoint, `connection-check.mjs` checks a proposed connection, and `resources.mjs` validates the bundled resource tree. The host supplies credentials through private IPC for Desktop and standalone CLI.
- Public MCP tools and execution must share the authenticated Playwright context. Do not create a second browser/CDP session: authentication and download handlers depend on context identity.
- The Loginom files folder is `/<username>`. Do not ask for a dataset folder or probe that folder during setup. The password starts empty and has no placeholder.
- Keep original tool validation authoritative. OpenAI schema compatibility is adapted at `../agent/src/provider/transform.ts`; do not weaken runtime action validation to satisfy a model provider. In particular, `validateUiAction` enforces stage/action constraints after structured enum normalization.
- Bundled Node, Playwright/MCP and Chromium must match `../product/loginom-release.json`. Startup must not download npm packages or a browser. Linux sandbox remains enabled; root/`--no-sandbox` are not acceptance workarounds.
- Run relevant Node tests in `client/test`; `bun run test:upstream` runs the broader client suite. Use the pinned Node version. Managed integration checks are under `../desktop/test/loginom` and documented in the [Linux runbook](../../docs/testing/loginom-ai-agent/linux.md).
- Native Windows/macOS resources and acceptance belong to their separate [runbooks](../../docs/testing/loginom-ai-agent/README.md). Linux results do not certify those platforms.

- Managed shutdown rejects new work, aborts the active call, drains accepted requests and closes resources before acknowledging. Propagate resource cleanup failures; do not acknowledge before cleanup or treat forced process exit as proof of browser cleanup.

- On startup error, clean up resources but keep the private IPC channel open until the owner receives an acknowledged close. Exiting earlier masks the original error as unconfirmed cleanup. Owner disconnect still closes and exits.

- Private call replies distinguish `activeWork` (a live executor, node job or delivery) from the broader `recoveryPending`/unsettled indicator. The host must retain durable admission records during active work without blocking the owner's wait calls. Once work stops, retained uncertainty still requires recovery; active work is not proof of successful completion.

- Artifact delivery may refresh a destination-folder lookup after a matched UI_EPOCH_CHANGED receipt only when status is NOT_APPLIED, phase is preconditions, effect_possible is false and cleanup_complete is true. Use a new observation/ref/action ID, revalidate the same document/workflow/tab/parent directory and verified folder, and stop after three attempts or cancellation. This does not authorize retrying upload, verification, uncertain navigation, or a prior settled delivery/recovery record.

- Resource manifests may describe internal directory symlinks with link text and directory:true, hashing the link text. Verify the actual symlink, canonical containment and directory type; target files remain individually hashed. Legacy files-only manifests remain supported.
