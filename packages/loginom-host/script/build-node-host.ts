import { isAbsolute, join } from "node:path"

export async function buildNodeHost(output: string) {
  if (!isAbsolute(output)) throw new Error("LOGINOM_ABSOLUTE_PATH_REQUIRED")
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "../src/node-entry.ts")],
    outdir: output,
    naming: "node-host.mjs",
    target: "node",
    packages: "bundle",
    splitting: false,
    metafile: true,
  })
  if (!result.success) throw new AggregateError(result.logs, "LOGINOM_HOST_BUILD_FAILED")
  if (!result.metafile) throw new Error("LOGINOM_HOST_BUILD_METADATA_MISSING")
  await Bun.write(join(output, "build-inputs.json"), JSON.stringify(result.metafile, null, 2))
  return join(output, "node-host.mjs")
}

if (import.meta.main) {
  if (!process.argv[2]) throw new Error("Provide an absolute host output directory")
  await buildNodeHost(process.argv[2])
}
