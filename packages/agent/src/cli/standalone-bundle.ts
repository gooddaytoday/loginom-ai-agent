import { access } from "node:fs/promises"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { verifyCliManifest } from "@loginom-ai-agent/loginom-host/cli-manifest"
import { InstallationVersion } from "@loginom-ai-agent/core/installation/version"

export async function standaloneBundle() {
  const installed = resolve(dirname(process.execPath), "..")
  const root =
    process.env.LOGINOM_AI_AGENT_CLI_BUNDLE ??
    (await verifyCliManifest(installed, {
      platform: process.platform,
      arch: process.arch,
      version: InstallationVersion,
    }).then(
      () => join(installed, "resources/loginom"),
      () => {
        throw new Error("LOGINOM_BUNDLE_INCOMPLETE")
      },
    ))
  if (!root || !isAbsolute(root)) throw new Error("LOGINOM_BUNDLE_REQUIRED")
  const resources = resolve(root)
  const node = join(resources, process.platform === "win32" ? "bin/node.exe" : "bin/node")
  const entry = join(resources, "host/node-host.mjs")
  const files = await Promise.all(
    [node, entry, ...(process.platform === "darwin" ? [join(resources, "bin/loginom-keychain")] : [])].map((file) =>
      access(file).then(
        () => true,
        () => false,
      ),
    ),
  )
  if (files.some((value) => !value)) throw new Error("LOGINOM_BUNDLE_INCOMPLETE")
  return { resources, node, entry }
}
