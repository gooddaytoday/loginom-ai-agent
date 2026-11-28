export * as PluginProduct from "./product.js"

// Fork seam U1 (catalog CAT-07): the Loginom AI Agent product plugin is built in, runs last in `post`, and its ID is
// guarded against config removals and reserved against packages that claim it.
import LoginomAgent, { Dashboard, instructionsKey, profileInstructions } from "@loginom-ai-agent/loginom-agent"
import { makeGlobalNode } from "@opencode/util/effect/app-node"
import { Context, Effect, Layer } from "effect"
import { Formatter } from "../formatter.js"
import type { KV } from "../kv.js"
import { InstructionEntry } from "../session/instruction-entry.js"
import type { InternalPlugin } from "./internal.js"
import { PluginPromise } from "./promise.js"
import { storageNamespace } from "./storage.js"

const product = PluginPromise.fromPromise(LoginomAgent)

const profileEntry = InstructionEntry.Key.make("loginom-profile")

export const initialInstructions = Effect.fn("PluginProduct.initialInstructions")(function* (
  kv: KV.Interface,
  parent?: InstructionEntry.Snapshot,
): Effect.fn.Return<InstructionEntry.Snapshot | undefined> {
  if (parent) {
    const entry = parent.find((item) => item.key === profileEntry && !item.removed)
    return entry ? [entry] : undefined
  }
  const text = profileInstructions(yield* kv.get(storageNamespace(product.id) + instructionsKey))
  if (text) return [{ key: profileEntry, value: text, removed: false }]
})

// No formatter runs in a dashboard's work folder, whatever the config says (B2.9d, guarantee G1): a formatter loads
// its own config from the folder of the file it formats (Prettier runs `src/.prettierrc.cjs`), and there the model
// writes. The Promise API has no formatter domain, so the product plugin's activation, the last, removes them all.
export const plugins: readonly InternalPlugin[] = [
  {
    id: product.id,
    effect: (ctx) =>
      Effect.gen(function* () {
        const formatter = yield* Formatter.Service
        const dashboard = Dashboard.latch(ctx.location.directory)
        yield* formatter.transform((editor) => {
          if (dashboard()) editor.list().forEach((name) => editor.remove(name))
        })
        yield* product.effect(ctx)
      }),
  },
]
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
