import { isAbsolute, join } from "node:path"

export async function buildNodeHost(output: string) {
  if (!isAbsolute(output)) throw new Error("LOGINOM_ABSOLUTE_PATH_REQUIRED")
  // Bun 1.3.14 can reuse invalid file data when bundling modules already loaded
  // by an earlier test file. A fresh process also isolates repeated host builds.
  // Keep the caller's cwd: build-inputs.json paths are relative to that directory.
  const child = Bun.spawn([process.execPath, import.meta.path, output], {
    cwd: process.cwd(),
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  })
  if ((await child.exited) !== 0) throw new Error("LOGINOM_HOST_BUILD_FAILED")
  return join(output, "node-host.mjs")
}

async function bundleNodeHost(output: string) {
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
  await bundleNodeHost(process.argv[2])
}
