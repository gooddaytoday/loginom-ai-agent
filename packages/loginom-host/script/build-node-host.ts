import { isAbsolute, join } from "node:path"

export async function buildNodeHost(output: string, env: NodeJS.ProcessEnv = {}) {
  const con08TestBuild =
    env.LOGINOM_AI_AGENT_CON08_TEST_BUILD === "1" &&
    env.GITHUB_ACTIONS === "true" &&
    env.GITHUB_EVENT_NAME === "workflow_dispatch" &&
    env.GITHUB_JOB === "con08-fixture" &&
    !!env.GITHUB_REPOSITORY &&
    env.GITHUB_WORKFLOW_REF?.startsWith(`${env.GITHUB_REPOSITORY}/.github/workflows/loginom-windows.yml@`) === true
  if (!isAbsolute(output)) throw new Error("LOGINOM_ABSOLUTE_PATH_REQUIRED")
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "../src/node-entry.ts")],
    outdir: output,
    naming: "node-host.mjs",
    target: "node",
    packages: "bundle",
    splitting: false,
    define: { LOGINOM_AI_AGENT_CON08_TEST_BUILD: JSON.stringify(con08TestBuild) },
    metafile: true,
  })
  if (!result.success) throw new AggregateError(result.logs, "LOGINOM_HOST_BUILD_FAILED")
  if (!result.metafile) throw new Error("LOGINOM_HOST_BUILD_METADATA_MISSING")
  await Bun.write(join(output, "build-inputs.json"), JSON.stringify(result.metafile, null, 2))
  return join(output, "node-host.mjs")
}

if (import.meta.main) {
  if (!process.argv[2]) throw new Error("Provide an absolute host output directory")
  await buildNodeHost(process.argv[2], process.env)
}
