import { expect, test } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { httpClient } from "@opencode-ai/core/effect/app-node-platform"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Npm } from "@opencode-ai/core/npm"
import { Effect, Layer } from "effect"
import { HttpClient } from "effect/unstable/http"
import { Account } from "../../src/account/account"
import { Auth } from "../../src/auth"
import { Config } from "@/config/config"
import { CurrentWorkingDirectory } from "@/config/tui-cwd"
import { TuiConfig } from "../../src/config/tui"
import { Env } from "../../src/env"
import { pluginDependency } from "../../src/product/installation"
import { AccountTest } from "../fake/account"
import { AuthTest } from "../fake/auth"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

type Requested = { dir: string; add: ReadonlyArray<{ name: string; version?: string }> }

const recordingNpm = (requested: Requested[]) =>
  Layer.mock(Npm.Service)({
    install: (dir, options) =>
      Effect.sync(() => {
        requested.push({ dir, add: options?.add ?? [] })
      }),
  })

const noHttp = HttpClient.make((request) => Effect.die(`unexpected http request: ${request.method} ${request.url}`))

const serverRequests: Requested[] = []
const server = testEffect(
  LayerNode.compile(LayerNode.group([Config.node, FSUtil.node, Env.node, CrossSpawnSpawner.node]), [
    [Auth.node, AuthTest.empty],
    [Account.node, AccountTest.empty],
    [Npm.node, recordingNpm(serverRequests)],
    [httpClient, Layer.succeed(HttpClient.HttpClient, noHttp)],
  ]),
)

const tuiRequests: Requested[] = []
const tuiLayer = (directory: string) =>
  LayerNode.compile(LayerNode.group([TuiConfig.node, FSUtil.node]), [[Npm.node, recordingNpm(tuiRequests)]]).pipe(
    Layer.provide(Layer.succeed(CurrentWorkingDirectory, directory)),
  )

const publicName = "@loginom-ai-agent/plugin"

server.instance("server config requests the public plugin package in the background", () =>
  Effect.gen(function* () {
    serverRequests.length = 0
    const test = yield* TestInstance
    const fs = yield* FSUtil.Service
    yield* fs.makeDirectory(`${test.directory}/.loginom-ai-agent`, { recursive: true })
    yield* Config.use.get()
    yield* Config.use.waitForDependencies()

    const added = serverRequests.flatMap((request) => request.add)
    expect(added.length).toBeGreaterThan(0)
    expect(added.map((item) => item.name)).toEqual(added.map(() => publicName))
    expect(added.map((item) => item.version)).toEqual(added.map(() => undefined))
  }),
)

server.instance("tui config requests the public plugin package in the background", () =>
  Effect.gen(function* () {
    tuiRequests.length = 0
    const test = yield* TestInstance
    const fs = yield* FSUtil.Service
    yield* fs.makeDirectory(`${test.directory}/.loginom-ai-agent`, { recursive: true })
    yield* fs.writeJson(`${test.directory}/.loginom-ai-agent/tui.json`, { plugin: ["tui-plugin@1.0.0"] })
    yield* Effect.gen(function* () {
      yield* TuiConfig.Service.use((svc) => svc.get())
      yield* TuiConfig.Service.use((svc) => svc.waitForDependencies())
    }).pipe(Effect.provide(tuiLayer(test.directory)))

    const added = tuiRequests.flatMap((request) => request.add)
    expect(added.length).toBeGreaterThan(0)
    expect(added.map((item) => item.name)).toEqual(added.map(() => publicName))
    expect(added.map((item) => item.version)).toEqual(added.map(() => undefined))
  }),
)

test("a release build requests the public plugin package at the product version", () => {
  expect(pluginDependency({ local: false, version: "0.3.5" })).toEqual({ name: publicName, version: "0.3.5" })
})

test("a development build requests the latest public plugin package", () => {
  expect(pluginDependency({ local: true, version: "local" })).toEqual({ name: publicName, version: undefined })
})
