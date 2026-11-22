// Fork (CAT-13): managed policy from the system directory and MDM preferences outranks user config. The product reads
// its own system sources, so OpenCode installed on the same machine cannot impose its policy on the product.
import path from "path"
import fs from "fs/promises"
import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { Bus } from "@opencode/core/bus"
import { Config } from "@opencode/core/config"
import { ConfigDiscovery } from "@opencode/core/config/discovery"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { Credential } from "@opencode/core/credential"
import { Watcher } from "@opencode/core/filesystem/watcher"
import { Location } from "@opencode/core/location"
import { ManagedPolicy } from "@opencode/core/managed-policy"
import { AbsolutePath } from "@opencode/core/schema"
import { WellKnown } from "@opencode/core/wellknown"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Global } from "@opencode/util/global"
import { emptyCredentialNode, emptyWellknownNode } from "../fixture/config-nodes"
import { location } from "../fixture/location"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)

describe("product system configuration", () => {
  test("Linux, Windows and macOS system directories are the product's, not OpenCode's", () => {
    expect(ConfigDiscovery.systemDirectory("linux", {})).toBe(AbsolutePath.make("/etc/loginom-ai-agent"))
    expect(ConfigDiscovery.systemDirectory("win32", { ProgramData: "D:\\ProgramData" })).toBe(
      AbsolutePath.make(path.join("D:\\ProgramData", "loginom-ai-agent")),
    )
    expect(ConfigDiscovery.systemDirectory("darwin", {})).toBe(
      AbsolutePath.make("/Library/Application Support/loginom-ai-agent"),
    )
    const segments = (["linux", "win32", "darwin"] as const).flatMap((platform) =>
      ConfigDiscovery.systemDirectory(platform, {}).split(/[\\/]/),
    )
    expect(segments).not.toContain("opencode")
  })

  test("macOS MDM preferences use the product identifier, not ai.opencode.managed", () => {
    const paths = ConfigDiscovery.preferencePaths("alice")
    expect(paths.map((item) => path.basename(item))).toEqual([
      "com.loginom.aiagent.managed.plist",
      "com.loginom.aiagent.managed.plist",
    ])
    expect(paths.filter((item) => item.includes("opencode"))).toEqual([])
  })

  it.live("reads the product's managed policy under ProgramData and ignores OpenCode's next to it", () =>
    Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
      Effect.flatMap((tmp) => {
        const programData = path.join(tmp.path, "ProgramData")
        const project = path.join(tmp.path, "project")
        const write = (name: string, resource: string) =>
          fs
            .mkdir(path.join(programData, name), { recursive: true })
            .then(() =>
              fs.writeFile(
                path.join(programData, name, "loginom-ai-agent.json"),
                JSON.stringify({ policies: [{ action: "tool.use", resource, effect: "deny" }] }),
              ),
            )
        return Effect.promise(() =>
          Promise.all([
            write("opencode", "shell:opencode-policy"),
            write("loginom-ai-agent", "shell:product-policy"),
            fs.mkdir(project, { recursive: true }),
          ]),
        ).pipe(
          Effect.andThen(
            Effect.gen(function* () {
              const config = yield* Config.Service
              const resources = ManagedPolicy.statements(yield* config.entries()).map((policy) => policy.resource)
              expect(resources).toContain("shell:product-policy")
              expect(resources).not.toContain("shell:opencode-policy")
            }).pipe(
              Effect.provide(
                configLayer(
                  project,
                  path.join(tmp.path, "global"),
                  ConfigDiscovery.systemDirectory("win32", { ProgramData: programData }),
                ),
              ),
            ),
          ),
        )
      }),
    ),
  )
})

function configLayer(directory: string, globalDirectory: string, system: string) {
  return Layer.mergeAll(
    AppNodeBuilder.build(LayerNode.group([Config.node, Bus.node]), [
      Config.node.replace(Config.configured({ system })),
      Location.node.replace(
        Layer.succeed(
          Location.Service,
          Location.Service.of(
            location({ directory: AbsolutePath.make(directory) }, { projectDirectory: AbsolutePath.make(directory) }),
          ),
        ),
      ),
      Global.node.replace(Global.layerWith({ config: globalDirectory, home: path.join(globalDirectory, "home") })),
      Credential.node.replace(emptyCredentialNode),
      WellKnown.node.replace(emptyWellknownNode),
      Watcher.node.replace(Watcher.testLayer),
    ]),
    Watcher.testLayer,
  )
}
