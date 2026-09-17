# Product identity and release pins

- `src/index.ts` is the canonical product identity: display name `Loginom AI Agent`, slug/executable/config prefix `loginom-ai-agent`, environment prefix `LOGINOM_AI_AGENT_`, channel-specific application IDs. Keep prod/beta/dev storage isolated.
- The new-chat wordmark intentionally reads `Loginom AI`; it is not a replacement for the full application name.
- Linux DEB installation uses `/opt/<productSlug(channel)>`, production `/opt/loginom-ai-agent`. Display names must never become filesystem paths. Desktop packaging explicitly preserves the full menu name and application metadata.
- `loginom-release.json` pins the bundled Node, Electron, Playwright/MCP and Chromium versions and hashes. `models.json` is the build-time model snapshot. Update pins together with resource verification and platform acceptance, not opportunistically during a build.
- Update/changelog feeds remain disabled until a Loginom-owned release endpoint is configured. Never fall back to upstream OpenCode feeds.
- Run `bun test` and `bun typecheck` here when changing identity. See [desktop instructions](../desktop/AGENTS.md) and [Linux release runbook](../../docs/testing/loginom-ai-agent/linux.md).
