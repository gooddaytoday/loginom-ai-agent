import { Product } from "@loginom-ai-agent/product"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { Effect, Layer, type Context } from "effect"
import type { Interface, UpgradeFailedError } from "@/installation"

type Binding<Id> = {
  readonly Service: Context.Service<Id, Interface>
  readonly UpgradeFailedError: typeof UpgradeFailedError
}

// Desktop owns the signed product update channel. CLI must never discover or
// install an upstream OpenCode release, even for a legacy installation method.
export function installationNode<Id>(binding: Binding<Id>) {
  const unconfigured = () =>
    Effect.fail(
      new binding.UpgradeFailedError({
        stderr: `Automatic CLI updates are not configured for ${Product.name}. Install a ${Product.name} package.`,
      }),
    )

  return LayerNode.make({
    service: binding.Service,
    layer: Layer.succeed(
      binding.Service,
      binding.Service.of({
        info: () => Effect.succeed({ version: InstallationVersion, latest: InstallationVersion }),
        method: () => Effect.succeed("unknown"),
        latest: () => Effect.succeed(InstallationVersion),
        upgrade: unconfigured,
        upgradeMajor: unconfigured,
      }),
    ),
    deps: [],
  })
}

// Customer plugins import @opencode-ai/plugin. The product version differs from the core one,
// so the request pins the plugin API this build ships (packages/plugin/package.json).
export function pluginDependency() {
  return { name: "@opencode-ai/plugin", version: "1.19.5" }
}

export async function pluginDependencyRequired(dir: string, configured: boolean) {
  if (configured) return true
  const { stat } = await import("node:fs/promises")
  const { join } = await import("node:path")
  // Keep Npm.install's existing lock/dirty checks for profiles that already have dependencies.
  if (
    await stat(join(dir, "node_modules")).then(
      (entry) => entry.isDirectory(),
      () => false,
    )
  )
    return true
  const { Glob } = await import("@opencode-ai/core/util/glob")
  return (
    (
      await Glob.scan("{plugin,plugins,tool,tools}/*.{js,ts}", {
        cwd: dir,
        dot: true,
        symlink: true,
      })
    ).length > 0
  )
}
