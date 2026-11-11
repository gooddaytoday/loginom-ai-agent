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
