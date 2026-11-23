// Loginom AI Agent (B2.7a2, B2.7a2b, G5): the resources of a built product CLI, found as 0.4 `standalone-bundle.ts`
// found them. `loginom-host/script/build-cli.ts` stages Node, the Host entry, Chromium and the product skills in
// `resources/loginom` next to `bin/`, and `cli-manifest.json` records every file of the artifact. The server gives the
// verified directory to its Host and to the product plugin as `LOGINOM_AI_AGENT_RESOURCES`; an explicit value is used
// as is. A built CLI whose artifact fails the check does not start its server, as 0.4 refused to run.
export * as CliResources from "./resources"

import { basename, dirname, extname, join, resolve } from "node:path"
import { Effect } from "effect"
import { LOGINOM_AI_AGENT_VERSION } from "./version"

/**
 * The verified `resources/loginom` of the artifact whose `bin/` holds `executable`, or `undefined` for a CLI run from
 * source. Any other executable is a built product CLI and needs its whole artifact: a file missing, changed or added,
 * or no manifest at all, rejects with `LOGINOM_BUNDLE_INCOMPLETE` and the check that failed.
 */
export async function locate(executable = process.execPath) {
  if (["bun", "node", "nodejs"].includes(basename(executable, extname(executable)).toLowerCase())) return undefined
  const root = resolve(dirname(executable), "..")
  // The check reads the product skills with `yaml` from the runtime client's npm tree, which a source run may lack.
  const { verifyCliManifest } = await import("@loginom-ai-agent/loginom-host/cli-manifest")
  return verifyCliManifest(root, {
    platform: process.platform,
    arch: process.arch,
    version: LOGINOM_AI_AGENT_VERSION,
  }).then(
    () => join(root, "resources", "loginom"),
    (error: Error) =>
      Promise.reject(
        new Error(
          `LOGINOM_BUNDLE_INCOMPLETE: ${root} does not match its cli-manifest.json (${error.message}); reinstall the CLI`,
        ),
      ),
  )
}

/**
 * Sets `LOGINOM_AI_AGENT_RESOURCES` to the located resources unless it is already set. Fails with the located error for
 * an incomplete artifact, so the server exits before it listens and its client shows why.
 */
export const apply = Effect.fnUntraced(function* (env: NodeJS.ProcessEnv = process.env, executable = process.execPath) {
  if (env.LOGINOM_AI_AGENT_RESOURCES !== undefined) return
  const resources = yield* Effect.tryPromise({
    try: () => locate(executable),
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  })
  if (resources) env.LOGINOM_AI_AGENT_RESOURCES = resources
})
