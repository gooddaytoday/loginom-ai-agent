export * as PluginProduct from "./product.js"

// Fork seam U1 (catalog CAT-07): the Loginom AI Agent product plugin is built in, runs last in `post`, and its ID is
// guarded against config removals and reserved against packages that claim it.
import createLoginomAgent, { Dashboard, pluginID } from "@loginom-ai-agent/loginom-agent"
import { makeGlobalNode } from "@opencode/util/effect/app-node"
import { Context, Effect, Layer, Schema } from "effect"
import { Formatter } from "../formatter.js"
import { Session } from "../session.js"
import type { InternalPlugin } from "./internal.js"
import { PluginPromise } from "./promise.js"

const decodeSessionID = Schema.decodeUnknownEffect(Session.ID)

// No formatter runs in a dashboard's work folder, whatever the config says (B2.9d, guarantee G1): a formatter loads
// its own config from the folder of the file it formats (Prettier runs `src/.prettierrc.cjs`), and there the model
// writes. The Promise API has no formatter domain, so the product plugin's activation, the last, removes them all.
export const plugins: readonly InternalPlugin[] = [
  {
    id: pluginID,
    effect: (ctx) =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const formatter = yield* Formatter.Service
        const dashboard = Dashboard.latch(ctx.location.directory)
        yield* formatter.transform((editor) => {
          if (dashboard()) editor.list().forEach((name) => editor.remove(name))
        })
        // The public session representation omits workspaceID.
        const product = createLoginomAgent((id) =>
          Effect.runPromise(
            decodeSessionID(id).pipe(
              Effect.flatMap(sessions.get),
              Effect.map(({ location }) =>
                location.directory === ctx.location.directory && location.workspaceID === ctx.location.workspaceID,
              ),
              Effect.orElseSucceed(() => false),
            ),
          ),
        )

        yield* PluginPromise.fromPromise(product).effect(ctx)
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
