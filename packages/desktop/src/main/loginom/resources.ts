// Loginom AI Agent (B4.8a): the Loginom resources of the application. `scripts/bundle-loginom.ts` stages Node, Chromium,
// the Dock runtime, help and the product skills into `resources/loginom`, listed by `resource-manifest.json`, and builds
// the Host entry `host/node-host.mjs` beside them. The installer verifies them with `--verify-resources`; the background
// service gets them as `LOGINOM_AI_AGENT_RESOURCES` for its Host (B2.3) and the product skills (B2.4).
export * as LoginomResources from "./resources"

import type { App } from "electron"
import { stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

export type Installation = {
  readonly packaged: boolean
  readonly resources: string
  readonly root: string
  readonly version: string
}

// The files the service's Host starts from. Only the manifest's files are hashed, and the Host entry is not among them.
const required = [
  "resource-manifest.json",
  process.platform === "win32" ? "bin/node.exe" : "bin/node",
  "host/node-host.mjs",
]

/**
 * Where the application keeps its Loginom resources: `<resources>/loginom` when packaged, the bundle-loginom output when
 * run from source. Verification records its cache and phases in `<userData>/loginom`, as 0.4 did.
 */
export function installation(app: Pick<App, "isPackaged" | "getPath" | "getVersion">): Installation {
  return {
    packaged: app.isPackaged,
    resources: app.isPackaged
      ? path.join(process.resourcesPath, "loginom")
      : path.join(path.dirname(fileURLToPath(import.meta.url)), "../../resources/loginom"),
    root: path.join(app.getPath("userData"), "loginom"),
    version: app.getVersion(),
  }
}

/**
 * The check behind `--verify-resources`: the Host entry is there and every file of the manifest matches its hash. On
 * Windows a Chromium warmup follows, as in 0.4. Rejects when anything is missing or changed.
 */
export async function verify(input: Installation) {
  await complete(input.resources)
  const { verifyInstallationResources, warmInstallationBrowser } = await import("@loginom-ai-agent/loginom-host/host")
  const options = { root: input.root, resources: input.resources, resourceVersion: input.version }
  const verified = await verifyInstallationResources(options)

  if (process.platform !== "win32") return
  // Warmup is advisory. Full integrity/cache failures above and below remain fatal.
  await warmInstallationBrowser({ root: input.root, resources: input.resources, verified }).catch(() => undefined)
  await verifyInstallationResources({ ...options, forceHash: false })
}

/**
 * The background service's environment. A packaged app always gives the service its own resources, whatever value it
 * inherited (0.4), and refuses to start it without the files its Host starts from, as a built CLI refuses to serve
 * (B2.7a2b). A run from source adds nothing: the service inherits an explicit value or runs without a Host.
 */
export async function serviceEnvironment(input: Pick<Installation, "packaged" | "resources">) {
  if (!input.packaged) return undefined
  await complete(input.resources)

  return { LOGINOM_AI_AGENT_RESOURCES: input.resources }
}

async function complete(resources: string) {
  const missing = await Promise.all(
    required.map((file) =>
      stat(path.join(resources, file)).then(
        (entry) => (entry.isFile() && entry.size > 0 ? [] : [file]),
        () => [file],
      ),
    ),
  ).then((files) => files.flat())

  if (missing.length > 0)
    throw new Error(`LOGINOM_BUNDLE_INCOMPLETE: ${resources} lacks ${missing.join(", ")}; reinstall the application`)
}
