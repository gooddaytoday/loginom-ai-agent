# Loginom runtime host

- This package owns runtime supervision (`src/supervisor.ts`), private transport (`transport.ts`), the backend adapter (`adapter.ts`) and original-user input admission (`inputs.ts`). Desktop owns credentials and connection generations; the model must not become their authority.
- Start the bundled Node/runtime for the selected connection generation and chat. Do not use a globally installed Dock, Node or browser as a runtime dependency.
- Credentials travel through private IPC. Forward only the allowed environment, including HTTP/HTTPS/NO_PROXY and required Linux desktop session variables. Do not forward provider credentials or log secrets.
- Dataset admission must bind the bytes to the original user attachment. Model-generated paths, filenames or tokens cannot authorize filesystem access. Never expose `host_context_token` as a model parameter.
- Keep cancellation, parent death and runtime cleanup reliable. An uncertain operation must be surfaced for recovery, never retried silently.
- Run `bun test` and `bun typecheck` from this directory. Desktop integration tests live in `../desktop/test/loginom`; real runtime/browser acceptance needs the pinned resources.
- See [desktop connection ownership](../desktop/src/main/loginom/AGENTS.md), [runtime contracts](../loginom-runtime/AGENTS.md), and [canonical checkpoint](../../docs/migration/linux-implementation-checkpoint.md).
