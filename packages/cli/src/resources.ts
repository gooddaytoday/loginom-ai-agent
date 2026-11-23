// Loginom AI Agent (B2.7a2, G5): the resources of a built product CLI, found as 0.4 `standalone-bundle.ts` found them.
// `loginom-host/script/build-cli.ts` stages Node, the Host entry, Chromium and the product skills in `resources/loginom`
// next to `bin/`, and `cli-manifest.json` records every file of the artifact. The server gives the verified directory to
// its Host and to the product plugin as `LOGINOM_AI_AGENT_RESOURCES`; an explicit value is used as is.
export * as CliResources from "./resources"

import { basename, dirname, extname, join, resolve } from "node:path"
import { Effect } from "effect"
import { LOGINOM_AI_AGENT_VERSION } from "./version"

const incomplete =
  "LOGINOM_BUNDLE_INCOMPLETE: the CLI files do not match cli-manifest.json; the Loginom Host and the product skills are unavailable, reinstall the CLI"

/**
 * The verified `resources/loginom` of the artifact whose `bin/` holds `executable`, or `undefined` for a CLI run from
 * source. Checks every file against the manifest, including the product skills on Linux: a file missing, changed or
 * added, or no manifest at all, rejects with `LOGINOM_BUNDLE_INCOMPLETE`.
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
    () => Promise.reject(new Error("LOGINOM_BUNDLE_INCOMPLETE")),
  )
}

/**
 * Sets `LOGINOM_AI_AGENT_RESOURCES` to the located resources unless it is already set. An incomplete artifact leaves it
 * unset and says so on stderr and in the log: the server still starts, without the Host and the product skills (B2.3).
 */
export const apply = Effect.fnUntraced(function* (env: NodeJS.ProcessEnv = process.env, executable = process.execPath) {
  if (env.LOGINOM_AI_AGENT_RESOURCES !== undefined) return
  const resources = yield* Effect.tryPromise(() => locate(executable)).pipe(
    Effect.catch(() =>
      Effect.sync(() => process.stderr.write(incomplete + "\n")).pipe(
        Effect.andThen(Effect.logWarning(incomplete)),
        Effect.as(undefined),
      ),
    ),
  )
  if (resources) env.LOGINOM_AI_AGENT_RESOURCES = resources
})
