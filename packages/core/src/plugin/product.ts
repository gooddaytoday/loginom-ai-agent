export * as PluginProduct from "./product.js"

// Fork seam U1 (catalog CAT-07): the Loginom AI Agent product plugin is built in, runs last in `post`, and its ID is
// guarded against config removals and reserved against packages that claim it.
import LoginomAgent from "@loginom-ai-agent/loginom-agent"
import { makeGlobalNode } from "@opencode/util/effect/app-node"
import { Context, Layer } from "effect"
import type { InternalPlugin } from "./internal.js"
import { PluginPromise } from "./promise.js"

export const plugins: readonly InternalPlugin[] = [PluginPromise.fromPromise(LoginomAgent)]
export const ids: readonly string[] = plugins.map((plugin) => plugin.id)

// Whether plugin packages from config and plugin directories load (В-80). The library keeps OpenCode's default for its
// own tests and embedders; the product server turns packages off (`pluginPackages: false`, `cli/src/server-process.ts`).
export class Packages extends Context.Service<Packages, { readonly allowed: boolean }>()(
  "@opencode/PluginProduct/Packages",
) {}

export function configured(allowed = true) {
  return makeGlobalNode({ service: Packages, layer: Layer.succeed(Packages, Packages.of({ allowed })), deps: [] })
}

export const node = configured()
