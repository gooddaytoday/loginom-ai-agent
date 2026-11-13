import { expect } from "bun:test"
import { Cause, Effect, Exit, Layer } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Session } from "@/session/session"
import { MessageID } from "@/session/schema"
import { DashboardDraftTool } from "@/tool/dashboard"
import { Agent } from "@/agent/agent"
import { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { AppProcess } from "@opencode-ai/core/process"
import { testInstanceStoreLayer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(
  LayerNode.compile(LayerNode.group([Agent.node, Session.node, SessionProjector.node, RuntimeFlags.node, Truncate.node, FSUtil.node, AppProcess.node]), [
    [RuntimeFlags.node, RuntimeFlags.layer()],
  ]),
  testInstanceStoreLayer,
))

it.instance("dashboard_draft reports missing installation resources", () => Effect.gen(function* () {
  const sessions = yield* Session.Service
  const session = yield* sessions.create()
  const ctx: Tool.Context = {
    sessionID: session.id,
    messageID: MessageID.ascending(),
    agent: "build",
    abort: new AbortController().signal,
    messages: [],
    metadata: () => Effect.void,
    ask: () => Effect.die("Draft does not request publication permission"),
  }
  const definition = yield* DashboardDraftTool
  const tool = yield* definition.init()
  const exit = yield* tool.execute({}, ctx).pipe(Effect.exit)
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) expect(String(Cause.squash(exit.cause))).toContain("DASHBOARD_RESOURCES_MISSING")
}))
