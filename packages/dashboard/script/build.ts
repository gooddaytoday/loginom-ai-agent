import { join } from "node:path"

const result = await Bun.build({
  entrypoints: [join(import.meta.dirname, "../src/web/server.ts")],
  outdir: join(import.meta.dirname, "../dist"),
  naming: "server.mjs",
  target: "node",
  format: "esm",
  packages: "bundle",
})
if (!result.success) throw new AggregateError(result.logs, "Could not build dashboard service")

const shell = await Bun.build({
  entrypoints: [join(import.meta.dirname, "../src/shell/index.ts")],
  outdir: join(import.meta.dirname, "../dist"),
  naming: "shell.js",
  target: "browser",
  format: "iife",
  minify: true,
})
if (!shell.success) throw new AggregateError(shell.logs, "Could not build dashboard shell")

await Bun.write(join(import.meta.dirname, "../template/src/loginom.ts"), Bun.file(join(import.meta.dirname, "../src/sdk/loginom.ts")))

const draft = await Bun.build({
  entrypoints: [join(import.meta.dirname, "../src/draft/page.ts")],
  outdir: join(import.meta.dirname, "../dist"),
  naming: "draft.js",
  target: "browser",
  format: "iife",
  minify: true,
})
if (!draft.success) throw new AggregateError(draft.logs, "Could not build dashboard draft page")
