import { isAbsolute, join } from "node:path"

export async function buildPackageDocs(output: string) {
  if (!isAbsolute(output)) throw Error("LOGINOM_ABSOLUTE_PATH_REQUIRED")
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "../src/package-docs/cli.ts")],
    outdir: output,
    naming: "package-docs.mjs",
    target: "node",
    packages: "bundle",
    splitting: false,
    metafile: true,
  })
  if (!result.success) throw new AggregateError(result.logs, "LOGINOM_DOCS_BUILD_FAILED")
  if (!result.metafile) throw Error("LOGINOM_DOCS_BUILD_METADATA_MISSING")
  return { script: join(output, "package-docs.mjs"), root: process.cwd(), metafile: result.metafile }
}

if (import.meta.main) {
  if (!process.argv[2]) throw Error("Provide an absolute package-docs output directory")
  process.stdout.write(JSON.stringify(await buildPackageDocs(process.argv[2])) + "\n")
}
