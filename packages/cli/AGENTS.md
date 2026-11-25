# CLI and TUI development guide

- Use `@opencode/client` and the location-scoped data in `packages/tui/src/context/data.tsx`.
- Preserve established TUI behavior unless the task intentionally changes it.

## Product CLI (`loginom-ai-agent-cli`)

- `src/loginom-cli.ts` is the product entry. It applies the CLI profile (`src/profile.ts`) before the CLI loads; `src/standalone.ts` answers help, version, `diagnostics export` and the `loginom` commands before the profile opens. Neither may import `@opencode/util/global` statically: it fixes its paths on import.
- `LOGINOM_AI_AGENT_CLI_PROFILE` selects an absolute profile; the bootstrap sets the internal `LOGINOM_AI_AGENT_CLI_ROOT`. The profile root has one writer latch, `.writer`. Never steal it by age or PID, and leave it after unconfirmed cleanup.
- `src/loginom-management.ts` implements `loginom` setup, check, status, cancel-pending and recover through the private Node host. Recovery requires `--acknowledge`; noninteractive setup requires stdin JSON. A configuration refusal emits `LOGINOM_CONFIG_REQUIRED` and exits 2; a connection that is not ready emits `LOGINOM_CONNECTION_NOT_READY` and exits 1 (`src/run/product.ts`).
- Update notices (`src/update-notifier.ts`) use only the build-time `LOGINOM_AI_AGENT_UPDATE_FEED`, never upstream feeds; empty means no checks. Feed and download URLs must use HTTPS, the signature is verified by `@loginom-ai-agent/product/update-signature`, and nothing is installed. `LOGINOM_AI_AGENT_NO_UPDATE_NOTIFIER=1` and CI turn notices off; the machine `policy.json` overrides the channel.
- Build the product executable with `bun script/build.ts --standalone --single --skip-install` from `packages/cli`. Source process tests do not establish installed CLI or interactive TTY acceptance; see the [standalone runbook](../../docs/testing/loginom-ai-agent/standalone-cli.md).
