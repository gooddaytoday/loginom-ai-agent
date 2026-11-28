# `@opencode/plugin`

Authoring interfaces and runtime loader support for OpenCode V2 plugins:

- `@opencode/plugin` — [Promise plugin API](./src/README.md)
- `@opencode/plugin/effect` — [Effect plugin API](./src/effect/README.md)
- `@opencode/plugin/rpc` — portable RPC contract definitions
- `@opencode/plugin/tui` — terminal UI plugin API

## Permission Reply Notices

`ctx.permission.reply(input, { resolveNotice })` in the Promise API accepts an async callback. In the Effect API, pass the notice-producing Effect as the second argument. It supplies the history notice in place of `input.notice`.

The host claims the reply before running `resolveNotice`. Competing replies receive `NotFound`. The resolver can persist the scope granted by this reply while the tool is still waiting, then return the notice for the outcome it saved. For example, a plugin can return a one-time approval notice when saving a session grant fails.

The host checks both forms of the notice against the same 2000 Unicode code point limit, settles the waiting tool, and publishes the history notice. A resolver failure or an oversized notice is logged and the history notice is omitted. The underlying permission decision still takes effect.

## Packaging And Runtime `effect`

When the OpenCode CLI loads server or TUI plugins, it resolves imports of `effect`, exported `effect/*` subpaths, and `@opencode/plugin` entrypoints (including imports from dependencies inside a plugin's `node_modules`) to the host's runtime module instances so fibers, loggers, and `Schema` parsers share one copy.

- Declare `"effect": "^4.0.0"` as a `peerDependency` (and `devDependency` for local type-checking and testing) rather than a bundled runtime dependency.
- Do not bundle `effect` into published plugin files; if you build with a bundler, keep `effect` and `effect/*` external. Two copies of `effect` do not share fiber, logger, or `Schema` internals.
- Plugins and their `node_modules` dependencies always receive OpenCode's host `effect` instance. Use `effect` APIs and module paths compatible with the OpenCode release you target; dependencies built on another `effect` major (such as Effect 3) are not supported.
- Only public `effect` subpaths are provided. A plugin that imports one of Effect's private `internal` modules fails to load with an error naming the path.
- The compiled OpenCode binary does not include the Scalar and Swagger UI assets used by Effect's HTTP API docs pages; serving those pages from a plugin shows a notice instead.
