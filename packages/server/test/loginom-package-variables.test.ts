import { copyFile, realpath } from "node:fs/promises"
import { join } from "node:path"
import { expect } from "bun:test"
import { Agent } from "@opencode/core/agent"
import { Model } from "@opencode/core/model"
import { Provider } from "@opencode/core/provider"
import { Session } from "@opencode/core/session"
import { Location } from "@opencode/schema/location"
import { AbsolutePath } from "@opencode/schema/schema"
import { Context, Effect, Layer } from "effect"
import { HttpEffect, HttpRouter, HttpServer } from "effect/http"
import { tmpdirScoped } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"
import { createEmbeddedRoutes } from "../src/routes"
import { pluginsLoaded } from "./fixture/routes"

const fixture = new URL("../../../evals/tasks/node-evals/crosstable-local-variable-bindings/reference.lgp", import.meta.url)

it.live("routes the real variables RPC after plugin activation", Effect.gen(function* () {
  const temp = yield* tmpdirScoped("loginom-package-variables-")
  const directory = yield* Effect.promise(() => realpath(temp.path))
  yield* Effect.promise(() => copyFile(fixture, join(directory, "reference.lgp")))
  const context = yield* Layer.build(createEmbeddedRoutes({
    app: { channel: "dev", version: "test" },
    config: { directory, project: false, content: "{}", claude: false },
    database: { path: ":memory:" },
    models: { fetch: false, snapshot: false },
    fs: { filewatcher: false, fff: false },
  }).pipe(Layer.provide(HttpServer.layerServices)))
  yield* pluginsLoaded(context, directory)
  const location = Location.Ref.make({ directory: AbsolutePath.make(directory) })
  const session = yield* Context.get(context, Session.Service).create({
    title: "Saved package variables",
    agent: Agent.ID.make("build"),
    model: { providerID: Provider.ID.make("test"), id: Model.ID.make("fixture") },
    location,
  })
  const handler = Context.get(context, HttpRouter.HttpRouter).asHttpEffect().pipe(HttpEffect.toWebHandlerWith(context))
  const call = (method: string, input: Record<string, string>) => Effect.promise(async () => {
    const query = new URLSearchParams({ "location[directory]": directory })
    const response = await handler(new Request(`http://opencode.local/api/rpc/${method}?${query}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: { sessionID: session.id, ...input } }),
    }))
    expect(response.status).toBe(200)
    return ((await response.json()) as { output: unknown }).output
  })
  expect(yield* call("loginom.package-variables/variables", { localPath: "reference.lgp" })).toMatchObject({
    snapshot: { definitions: [], truncated: false, usages: [
      { name: "CaptionSeparator", scope: "control" },
      { name: "GroupLimit", scope: "control" },
      { name: "CategoryNames", scope: "control" },
    ] },
  })
  expect(yield* call("loginom.package-variables/variables", {}))
    .toMatchObject({ snapshot: null, reason: "server_snapshot_unavailable" })
}), 30_000)
