import { Product } from "@loginom-ai-agent/product"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { InstallationLocal, InstallationVersion } from "@opencode-ai/core/installation/version"
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

export function pluginDependency(release = { local: InstallationLocal, version: InstallationVersion }) {
  return { name: "@loginom-ai-agent/plugin", version: release.local ? undefined : release.version }
}
