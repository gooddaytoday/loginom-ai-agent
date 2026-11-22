import { describe, expect, setDefaultTimeout } from "bun:test"
import path from "path"
import { Duration, Effect, Layer, LayerMap } from "effect"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { Watcher } from "@opencode/core/filesystem/watcher"
import { Instance } from "@opencode/core/instance"
import { LocationServiceMap } from "@opencode/core/location-services"
import { Location } from "@opencode/core/location"
import { Plugin } from "@opencode/core/plugin"
import { PluginProduct } from "@opencode/core/plugin/product"
import { ProviderPlugins } from "@opencode/core/plugin/provider"
import { SdkPlugins } from "@opencode/core/plugin/sdk"
import { AbsolutePath } from "@opencode/core/schema"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Global } from "@opencode/util/global"
import { Npm } from "@opencode/util/npm"
import { Bus } from "../../src/bus"
import { Database } from "../../src/database/database"
import { tempGlobalLayer } from "../fixture/global"
import { offlineModels } from "../fixture/models"
import { tmpdirScoped } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

// Fork seam U1 and built-in plugins only (В-80, catalog CAT-07): the product plugin `loginom.product` is built in, runs
// last, and a config package can neither take its ID nor switch it off (spike S8); with packages off, as in the product
// server, a config package is listed as failed and never imported. Real Location boot with the project's own config file.
setDefaultTimeout(30_000)

const product = Plugin.ID.make("loginom.product")

const npm = { calls: [] as string[] }
const unexpected = (name: string) =>
  Effect.sync(() => npm.calls.push(name)).pipe(Effect.andThen(Effect.die(new Error(`Unexpected Npm call: ${name}`))))

const instances = (packages: boolean) =>
  Layer.effect(
    LocationServiceMap.Service,
    Effect.gen(function* () {
      const map = yield* LayerMap.make((ref: Location.Ref) => Instance.layer(ref, { replacements: bindings }), {
        idleTimeToLive: Duration.infinity,
      })
      const bindings: LayerNode.Replacements = [
        Global.node.replace(tempGlobalLayer),
        offlineModels,
        Watcher.node.replace(Watcher.configured({ enabled: false })),
        PluginProduct.node.replace(PluginProduct.configured(packages)),
        Npm.node.replace(
          Layer.succeed(
            Npm.Service,
            Npm.Service.of({
              add: unexpected,
              resolve: unexpected,
              check: () => Effect.succeed(false),
              update: unexpected,
              which: () => Effect.undefined,
            }),
          ),
        ),
        LocationServiceMap.node.replace(Layer.succeed(LocationServiceMap.Service, map)),
        Instance.node.replace(
          Layer.succeed(Instance.Service, { provide: (session) => Effect.provide(map.get(session.location)) }),
        ),
      ]
      return map
    }),
  )

const harness = (packages: boolean) =>
  testEffect(
    AppNodeBuilder.build(LayerNode.group([Database.node, Bus.node, SdkPlugins.node, LocationServiceMap.node]), [
      Global.node.replace(tempGlobalLayer),
      offlineModels,
      LocationServiceMap.node.replace(instances(packages)),
    ]),
  )
// OpenCode's default: packages load, so only the reserved ID keeps an impostor out.
const it = harness(true)
// The product server (`pluginPackages: false`).
const builtinOnly = harness(false)

// Writes the project config and returns the plugin inventory of that Location once its plugins have activated.
const inventory = (directory: string, config: unknown) =>
  Effect.gen(function* () {
    yield* Effect.promise(() =>
      Bun.write(path.join(directory, ".loginom-ai-agent/loginom-ai-agent.json"), JSON.stringify(config)),
    )
    const locations = yield* LocationServiceMap.Service
    return yield* Effect.gen(function* () {
      const plugins = yield* Plugin.Service
      yield* plugins.awaitActivation
      return yield* plugins.list()
    }).pipe(
      Effect.scoped,
      Effect.provide(locations.get(Location.Ref.make({ directory: AbsolutePath.make(directory) }))),
    )
  })

// A local config package claiming `id`. Its marker file records whether the module was imported and whether setup ran.
const impostor = (directory: string, id: string) =>
  Effect.promise(async () => {
    const root = path.join(directory, "external", "impostor")
    const marker = path.join(directory, "impostor.log")
    await Bun.write(
      path.join(root, "index.ts"),
      `import { appendFileSync } from "node:fs"
appendFileSync(${JSON.stringify(marker)}, "imported\\n")
export default { id: ${JSON.stringify(id)}, async setup() { appendFileSync(${JSON.stringify(marker)}, "setup\\n") } }
`,
    )
    return { root, marker }
  })

const marks = (marker: string) =>
  Effect.promise(async () => ((await Bun.file(marker).exists()) ? await Bun.file(marker).text() : ""))

const builtinProduct = {
  id: product,
  source: { type: "builtin" },
  state: { status: "active" },
  features: { server: true },
} as const

describe("product plugin seam U1", () => {
  it.live("a config package with the product plugin's ID is rejected and the built-in stays active", () =>
    Effect.gen(function* () {
      const directory = (yield* tmpdirScoped()).path
      const package_ = yield* impostor(directory, product)
      const plugins = yield* inventory(directory, { plugins: [package_.root] })

      expect(plugins.filter((plugin) => plugin.id === product)).toEqual([builtinProduct])
      expect(plugins.find((plugin) => plugin.source.type === "local")).toEqual({
        source: { type: "local", path: package_.root },
        state: { status: "failed", error: `Plugin ID is reserved by a built-in plugin: ${product}` },
        features: { server: true },
      })
      // The loader imports a package to learn its ID; the impostor's setup must never run.
      expect(yield* marks(package_.marker)).toBe("imported\n")
    }),
  )

  for (const target of [product, "loginom.*", "*"]) {
    builtinOnly.live(`a config removal -${target} does not switch the product plugin off`, () =>
      Effect.gen(function* () {
        const directory = (yield* tmpdirScoped()).path
        const plugins = yield* inventory(directory, { plugins: [`-${target}`, "-opencode.config.agent"] })

        expect(plugins.filter((plugin) => plugin.id === product)).toEqual([builtinProduct])
        // The config was read: the other removal applied.
        expect(plugins.some((plugin) => plugin.id === "opencode.config.agent")).toBe(false)
        // Active plugins are listed in setup order: the product plugin runs last.
        expect(plugins.filter((plugin) => plugin.state.status === "active").at(-1)?.id).toBe(product)
      }),
    )
  }

  builtinOnly.live("with packages off a config package is listed as failed and never imported", () =>
    Effect.gen(function* () {
      npm.calls = []
      const directory = (yield* tmpdirScoped()).path
      const package_ = yield* impostor(directory, "third-party.plugin")
      const plugins = yield* inventory(directory, { plugins: [package_.root, "third-party-npm-plugin"] })

      const rejected = { status: "failed", error: "Plugin packages are disabled: only built-in plugins load" } as const
      expect(plugins.filter((plugin) => plugin.source.type !== "builtin")).toEqual([
        { source: { type: "local", path: package_.root }, state: rejected, features: { server: true } },
        { source: { type: "package", target: "third-party-npm-plugin" }, state: rejected, features: { server: true } },
      ])
      expect(yield* marks(package_.marker)).toBe("")
      expect(npm.calls).toEqual([])
      expect(plugins.filter((plugin) => plugin.id === product)).toEqual([builtinProduct])
    }),
  )

  builtinOnly.live("with packages off OpenCode's built-in provider plugins load", () =>
    Effect.gen(function* () {
      const directory = (yield* tmpdirScoped()).path
      const plugins = yield* inventory(directory, {})

      const active = new Set<string | undefined>(
        plugins.filter((plugin) => plugin.state.status === "active").map((plugin) => plugin.id),
      )
      const providers = [
        ...ProviderPlugins.map((plugin) => plugin.id),
        "opencode.models.dev",
        "opencode.provider.dynamic",
      ]
      expect(providers.filter((id) => !active.has(id))).toEqual([])
      // Login methods the stage B plan names for В-82.
      expect(
        [
          "opencode.provider.chatgpt",
          "opencode.provider.openai",
          "opencode.provider.github.copilot",
          "opencode.provider.opencode",
          "opencode.provider.claude-agent",
          "opencode.provider.ollama",
          "opencode.provider.lmstudio",
          "opencode.provider.vllm",
        ].filter((id) => !active.has(id)),
      ).toEqual([])
    }),
  )
})
