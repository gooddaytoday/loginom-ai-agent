export * as PluginProduct from "./product.js"

// Fork seam U1 (catalog CAT-07): the Loginom AI Agent product plugin is built in, runs last in `post`, and its ID is
// guarded against config removals and reserved against packages that claim it.
import LoginomAgent, {
  Dashboard,
  isModelServerID,
  modelServerFetch,
  modelServerHandlers,
  ModelServerRpc,
  registerWindowRpc,
} from "@loginom-ai-agent/loginom-agent"
import { Integration } from "@opencode/schema/integration"
import { makeGlobalNode } from "@opencode/util/effect/app-node"
import { Context, Effect, Layer, Semaphore, Stream } from "effect"
import { Config } from "../config.js"
import { Credential } from "../credential.js"
import { Formatter } from "../formatter.js"
import { ManagedPolicy } from "../managed-policy.js"
import { ModelResolver } from "../model-resolver.js"
import { ModelsDev } from "../models-dev.js"
import { Provider } from "../provider.js"
import type { InternalPlugin } from "./internal.js"
import { PluginPromise } from "./promise.js"

const product = PluginPromise.fromPromise(LoginomAgent)
const modelServerWrites = Semaphore.makeUnsafe(1)

ModelResolver.registerTransportFetch((model) => {
  if (
    isModelServerID(model.providerID) &&
    Provider.packageName(model.package) === "@opencode/ai/providers/openai-compatible"
  )
    return modelServerFetch
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
        yield* registerWindowRpc(ctx).pipe(Effect.orDie)
        yield* product.effect(ctx)
        const config = yield* Config.Service
        const credential = yield* Credential.Service
        const models = yield* ModelsDev.Service
        const allowed = (id: string) =>
          config
            .entries()
            .pipe(
              Effect.map(
                (entries) =>
                  ManagedPolicy.decision(ManagedPolicy.statements(entries), "integration.connect", id) !== "deny",
              ),
            )
        const mutate = <A, E>(effect: Effect.Effect<A, E>) =>
          modelServerWrites.withPermit(Effect.uninterruptible(effect))
        const modelServer = yield* ctx.rpc
          .register(
            ModelServerRpc,
            modelServerHandlers({
              catalogAvailable: models.remoteAvailable ?? Effect.succeed(false),
              allowed,
              save: (id, provider, key) =>
                mutate(
                  Effect.gen(function* () {
                    if (!config.update || !config.profile) return yield* Effect.fail("Config updates are unavailable")
                    const profile = yield* config.profile()
                    const providerID =
                      Object.entries(profile?.providers ?? {}).find(
                        ([existing, value]) =>
                          isModelServerID(existing) && value.settings?.baseURL === provider.settings?.baseURL,
                      )?.[0] ?? id
                    if (!(yield* allowed(providerID))) return
                    const integrationID = Integration.ID.make(providerID)
                    const previous = yield* credential.list(integrationID)
                    const active = key ? previous.find((entry) => entry.value.type === "key") : undefined
                    const value = key ? Credential.Key.make({ type: "key", key }) : undefined
                    const stored =
                      value && !active
                        ? yield* credential.create({
                            integrationID,
                            value,
                          })
                        : undefined
                    yield* config
                      .update({ providers: { [providerID]: provider } })
                      .pipe(Effect.onError(() => (stored ? credential.remove(stored.id) : Effect.void)))
                    if (active && value) {
                      yield* credential.update(active.id, { value })
                      yield* credential.activate(active.id)
                    }
                    yield* Effect.forEach(
                      previous.filter((entry) => entry.id !== active?.id),
                      (entry) => credential.remove(entry.id),
                    )
                    return providerID
                  }),
                ),
              remove: (id) =>
                mutate(
                  Effect.gen(function* () {
                    if (!config.update || !config.profile) return yield* Effect.fail("Config updates are unavailable")
                    const profile = yield* config.profile()
                    const stored = yield* credential.list(Integration.ID.make(id))
                    yield* Effect.forEach(stored, (entry) => credential.remove(entry.id))
                    if (!profile?.providers?.[id]) return
                    return yield* config.update({ providers: { [id]: undefined } }).pipe(
                      Effect.as(undefined),
                      Effect.catch((error) =>
                        stored.length
                          ? Effect.succeed("modelServerRemoveProfileFailed" as const)
                          : Effect.fail(error),
                      ),
                    )
                  }),
                ),
            }),
          )
          .pipe(Effect.orDie)
        if (models.remoteAvailabilityChanges)
          yield* models.remoteAvailabilityChanges.pipe(
            Stream.runForEach((available) =>
              modelServer.events.emit("catalogAvailabilityChanged", { available }).pipe(Effect.ignore),
            ),
            Effect.forkScoped({ startImmediately: true }),
          )
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
