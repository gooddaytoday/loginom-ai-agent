# Desktop connection lifecycle

- Electron main owns connection credentials, durable generations, private host IPC and recovery. Renderer uses the typed preload API and receives redacted status, never stored secret values.
- `connection-store.ts` persists configuration and pending changes; `credentials.ts` implements secret storage policy; `connection-service.ts` coordinates checks/activation; `desktop-service.ts` connects runtime ownership; `host-port.ts` guards private backend requests; `recovery-store.ts` persists uncertain outcomes.
- Linux intentionally stores secrets as plaintext configuration with files `0600`, directories `0700`. Production profile is `${XDG_CONFIG_HOME:-~/.config}/com.loginom.aiagent`; do not relocate it when changing the installation directory. Other channels have separate profiles.
- Lease a connection generation for the whole active drain. Save pending changes durably and activate only at a safe boundary. Attempts use isolated UUIDs; retain receipts across recovery.
- Persist/fsync recovery intent before tool dispatch. Interrupted or ambiguous operations require explicit acknowledgement; never replay them automatically.
- Setup asks exactly API key, Loginom URL, username and password. Defaults come from Product; password is empty without placeholder. The files folder derives from username without an availability probe. Model/provider connection stays in existing provider settings.
- Apply system proxies before backend/runtime startup. See `../system-proxy.ts`: manual GNOME HTTP/HTTPS settings override shell values, bypass includes loopback, and Node receives `NODE_USE_ENV_PROXY=1`. PAC/SOCKS/authenticated proxy support is not established by current acceptance.
- Run `bun test src/main/loginom` and `bun typecheck` from `packages/desktop`. Real GUI tests use isolated profiles; never restart or overwrite the user's running session for debugging.
- See [host boundary](../../../../loginom-host/AGENTS.md), [desktop release instructions](../../../AGENTS.md) and [acceptance runbooks](../../../../../docs/testing/loginom-ai-agent/README.md).
