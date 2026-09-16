import { HttpRecorder } from "@loginom-ai-agent/http-recorder"
import { HttpRecorderInternal } from "@loginom-ai-agent/http-recorder/internal"
import * as OpenAIChat from "@loginom-ai-agent/llm/protocols/openai-chat"
import { Auth, LLMClient, RequestExecutor } from "@loginom-ai-agent/llm/route"
import { Database } from "@loginom-ai-agent/core/database/database"
import { AppNodeBuilder } from "@loginom-ai-agent/core/effect/app-node-builder"
import { LayerNodePlatform } from "@loginom-ai-agent/core/effect/app-node-platform"
import { LayerNode } from "@loginom-ai-agent/core/effect/layer-node"
import { EventV2 } from "@loginom-ai-agent/core/event"
import { EventTable } from "@loginom-ai-agent/core/event/sql"
import { PermissionV2 } from "@loginom-ai-agent/core/permission"
import { AgentV2 } from "@loginom-ai-agent/core/agent"
import { Config } from "@loginom-ai-agent/core/config"
import { Project } from "@loginom-ai-agent/core/project"
import { ProjectTable } from "@loginom-ai-agent/core/project/sql"
import { AbsolutePath } from "@loginom-ai-agent/core/schema"
import { SessionV2 } from "@loginom-ai-agent/core/session"
import { Snapshot } from "@loginom-ai-agent/core/snapshot"
import { Prompt } from "@loginom-ai-agent/core/session/prompt"
import { SessionProjector } from "@loginom-ai-agent/core/session/projector"
import { SessionExecution } from "@loginom-ai-agent/core/session/execution"
import { SessionRunCoordinator } from "@loginom-ai-agent/core/session/run-coordinator"
import { SessionRunner } from "@loginom-ai-agent/core/session/runner"
import * as SessionRunnerLLM from "@loginom-ai-agent/core/session/runner/llm"
import { SessionRunnerModel } from "@loginom-ai-agent/core/session/runner/model"
import { ToolRegistry } from "@loginom-ai-agent/core/tool/registry"
import { ToolOutputStore } from "@loginom-ai-agent/core/tool-output-store"
import { SessionTable } from "@loginom-ai-agent/core/session/sql"
import { SessionStore } from "@loginom-ai-agent/core/session/store"
import { Location } from "@loginom-ai-agent/core/location"
import { SystemContextRegistry } from "@loginom-ai-agent/core/system-context/registry"
import { SystemContext } from "@loginom-ai-agent/core/system-context"
import { SkillGuidance } from "@loginom-ai-agent/core/skill/guidance"
import { ReferenceGuidance } from "@loginom-ai-agent/core/reference/guidance"
import { describe, expect } from "bun:test"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import path from "node:path"
import { testEffect } from "./lib/effect"

const cassette =
  process.env.RECORD === "true"
    ? HttpRecorderInternal.cassetteLayer("session-runner/openai-chat-streams-text", {
        directory: path.resolve(import.meta.dir, "fixtures/recordings"),
        mode: "record",
      })
    : HttpRecorder.http("session-runner/openai-chat-streams-text", {
        directory: path.resolve(import.meta.dir, "fixtures/recordings"),
      })
const executor = RequestExecutor.layer.pipe(Layer.provide(cassette))
const client = LLMClient.layer.pipe(Layer.provide(executor))
const permission = Layer.succeed(
  PermissionV2.Service,
  PermissionV2.Service.of({
    assert: () => Effect.die("unused"),
    ask: () => Effect.die("unused"),
    reply: () => Effect.die("unused"),
    get: () => Effect.die("unused"),
    forSession: () => Effect.die("unused"),
    list: () => Effect.die("unused"),
  }),
)
const model = OpenAIChat.route
  .with({
    endpoint: { baseURL: "https://api.openai.com/v1" },
    auth: Auth.bearer(process.env.OPENAI_API_KEY ?? "fixture"),
    generation: { maxTokens: 20, temperature: 0 },
  })
  .model({ id: "gpt-4o-mini" })
const models = SessionRunnerModel.layerWith(() => Effect.succeed(model))
const systemContext = AppNodeBuilder.build(SystemContextRegistry.node)
const skillGuidance = Layer.mock(SkillGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) })
const referenceGuidance = Layer.mock(ReferenceGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) })
const config = Layer.succeed(Config.Service, Config.Service.of({ entries: () => Effect.succeed([]) }))
const runnerLayer = AppNodeBuilder.build(SessionRunnerLLM.node, [
  [Snapshot.node, Snapshot.noopLayer],
  [LayerNodePlatform.llmClient, client],
  [SessionRunnerModel.node, models],
  [SystemContextRegistry.node, systemContext],
  [Location.node, Location.boundNode({ directory: AbsolutePath.make("/project") })],
  [SkillGuidance.node, skillGuidance],
  [ReferenceGuidance.node, referenceGuidance],
  [Config.node, config],
  [PermissionV2.node, permission],
  [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
])
const execution = Layer.effect(
  SessionExecution.Service,
  Effect.gen(function* () {
    const sessionRunner = yield* SessionRunner.Service
    const coordinator = yield* SessionRunCoordinator.make<SessionV2.ID, SessionRunner.RunError>({
      drain: (sessionID, force) => sessionRunner.run({ sessionID, force }),
    })
    return SessionExecution.Service.of({
      active: coordinator.active,
      resume: coordinator.run,
      wake: coordinator.wake,
      interrupt: coordinator.interrupt,
    })
  }),
).pipe(Layer.provide(runnerLayer))
const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([
      Database.node,
      EventV2.node,
      SessionProjector.node,
      SessionStore.node,
      AgentV2.node,
      ToolRegistry.node,
      SessionRunnerModel.node,
      SystemContextRegistry.node,
      SkillGuidance.node,
      ReferenceGuidance.node,
      Config.node,
      Snapshot.node,
      SessionRunnerLLM.node,
      SessionV2.node,
    ]),
    [
      [LayerNodePlatform.llmClient, client],
      [PermissionV2.node, permission],
      [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
      [SessionRunnerModel.node, models],
      [SystemContextRegistry.node, systemContext],
      [Location.node, Location.boundNode({ directory: AbsolutePath.make("/project") })],
      [SkillGuidance.node, skillGuidance],
      [ReferenceGuidance.node, referenceGuidance],
      [Config.node, config],
      [Snapshot.node, Snapshot.noopLayer],
      [SessionExecution.node, execution],
    ],
  ),
)
const sessionID = SessionV2.ID.make("ses_runner_recorded")

describe("SessionRunnerLLM recorded", () => {
  it.effect("executes one recorded V2 prompt through the recorded HTTP transport", () =>
    Effect.gen(function* () {
      const { db } = yield* Database.Service
      yield* db
        .insert(ProjectTable)
        .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
        .onConflictDoNothing()
        .run()
        .pipe(Effect.orDie)
      yield* db
        .insert(SessionTable)
        .values({
          id: sessionID,
          project_id: Project.ID.global,
          slug: "test",
          directory: "/project",
          title: "test",
          version: "test",
        })
        .onConflictDoNothing()
        .run()
        .pipe(Effect.orDie)
      const session = yield* SessionV2.Service
      const prompt = yield* session.prompt({
        sessionID,
        prompt: Prompt.make({ text: "Say hello in one short sentence." }),
        resume: false,
      })

      yield* session.resume(sessionID)

      const messages = yield* session.context(sessionID)
      expect(messages).toHaveLength(2)
      expect(messages[0]).toMatchObject({ id: prompt.id, type: "user", text: "Say hello in one short sentence." })
      expect(messages[1]).toMatchObject({ type: "assistant", agent: "build", finish: "stop" })
      expect(messages[1]?.type === "assistant" ? messages[1].content : []).toMatchObject([
        { type: "text", text: "Hello!" },
      ])
      expect(
        (yield* db
          .select({ type: EventTable.type })
          .from(EventTable)
          .where(eq(EventTable.aggregate_id, sessionID))
          .orderBy(EventTable.seq)
          .all()).map((event) => event.type),
      ).toEqual([
        "session.next.prompt.admitted.1",
        "session.next.prompted.1",
        "session.next.step.started.1",
        "session.next.text.started.1",
        "session.next.text.ended.1",
        "session.next.step.ended.2",
      ])
    }),
  )
})
