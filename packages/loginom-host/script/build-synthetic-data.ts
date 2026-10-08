import { isAbsolute, join } from "node:path"

export async function buildSyntheticData(output: string) {
  if (!isAbsolute(output)) throw Error("LOGINOM_ABSOLUTE_PATH_REQUIRED")
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "../src/synthetic-data/cli.ts")],
    outdir: output,
    naming: "synthetic-data.mjs",
    target: "node",
    packages: "bundle",
    splitting: false,
    metafile: true,
  })
  if (!result.success) throw new AggregateError(result.logs, "LOGINOM_SYNTHETIC_DATA_BUILD_FAILED")
  if (!result.metafile) throw Error("LOGINOM_SYNTHETIC_DATA_BUILD_METADATA_MISSING")
  return { script: join(output, "synthetic-data.mjs"), root: process.cwd(), metafile: result.metafile }
}

if (import.meta.main) {
  if (!process.argv[2]) throw Error("Provide an absolute synthetic-data output directory")
  process.stdout.write(JSON.stringify(await buildSyntheticData(process.argv[2])) + "\n")
}
