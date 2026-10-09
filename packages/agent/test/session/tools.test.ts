import { expect } from "bun:test"
import { ModelV2 } from "@loginom-ai-agent/core/model"
import { ProviderV2 } from "@loginom-ai-agent/core/provider"
import { SessionV1 } from "@loginom-ai-agent/core/v1/session"
import { FSUtil } from "@loginom-ai-agent/core/fs-util"
import { AppProcess } from "@loginom-ai-agent/core/process"
import { LayerNode } from "@loginom-ai-agent/core/effect/layer-node"
import { Agent } from "@/agent/agent"
import { MCP } from "@/mcp"
import { Permission } from "@/permission"
import { Provider } from "@/provider/provider"
import { Session } from "@/session/session"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { SessionProcessor } from "@/session/processor"
import { SessionTools } from "@/session/tools"
import { Tool } from "@/tool/tool"
import { ToolRegistry } from "@/tool/registry"
import { Truncate } from "@/tool/truncate"
import { Plugin } from "@/plugin"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { isRecord } from "@/util/record"
import { Cause, Effect, Exit, Layer, Schema } from "effect"
import { testEffect } from "../lib/effect"

const callID = "call-test"
const sessionID = SessionID.make("ses_test")
const messageID = MessageID.ascending()
const partID = PartID.ascending()

const agent: Agent.Info = {
  name: "build",
  mode: "primary",
  options: {},
  permission: [{ permission: "*", pattern: "*", action: "allow" }],
}

const model = {
  providerID: ProviderV2.ID.make("test"),
  api: { id: "test-model" },
} as Provider.Model

function fakeMcp() {
  return MCP.Service.of({
    tools: () => Effect.succeed({}),
    clients: () => Effect.succeed({}),
  } as Partial<MCP.Interface> as MCP.Interface)
}

const fakePlugin = Plugin.Service.of({
  init: () => Effect.void,
  list: () => Effect.succeed([]),
  trigger: (_name, _input, output) =>
    Effect.sync(() => {
      if (_name === "tool.execute.after" && isRecord(_input) && _input.tool === "timing" && isRecord(output))
        Object.assign(output, {
          metadata: {
            afterHook: true,
            activation: { name: "package-docs", profile: "package-docs", digest: "a".repeat(64) },
          },
        })
      return output
    }),
} satisfies Plugin.Interface)

const fakePermission = Permission.Service.of({
  ask: () => Effect.void,
  reply: () => Effect.void,
  list: () => Effect.succeed([]),
} satisfies Permission.Interface)

const fakeTruncate = Truncate.Service.of({
  cleanup: () => Effect.void,
  write: () => Effect.succeed("output.txt"),
  output: (text: string) => Effect.succeed({ content: text, truncated: false }),
  limits: () => Effect.succeed({ maxLines: 2000, maxBytes: 50 * 1024 }),
} satisfies Truncate.Interface)

const layer = Layer.mergeAll(
  LayerNode.compile(FSUtil.node),
  Layer.mock(AppProcess.Service, {}),
  Layer.mock(Session.Service, {}),
  Layer.mock(Agent.Service, {}),
  Layer.succeed(Plugin.Service, fakePlugin),
  Layer.succeed(Permission.Service, fakePermission),
  Layer.succeed(MCP.Service, fakeMcp()),
  Layer.succeed(Truncate.Service, fakeTruncate),
  RuntimeFlags.layer(),
  Layer.succeed(
    ToolRegistry.Service,
    ToolRegistry.Service.of({
      ids: () => Effect.succeed(["timing"]),
      all: () => Effect.succeed([]),
      named: () => Effect.die("unused"),
      tools: () =>
        Effect.succeed([
          {
            id: "timing",
            description: "updates metadata more than once",
            parameters: Schema.Struct({}),
            jsonSchema: { type: "object", properties: {} },
            execute: (_args, ctx) =>
              Effect.gen(function* () {
                yield* ctx.metadata({ metadata: { output: "first" } })
                yield* ctx.metadata({
                  metadata: {
                    output: "second",
                    activation: { name: "package-docs", profile: "package-docs", digest: "a".repeat(64) },
                    activation_pending: {},
                    skill_activation: {},
                    skill_activation_pending: {},
                    compaction_replay_of: "msg_forged",
                  },
                })
                return { title: "timing", metadata: {}, output: "done" }
              }),
          } satisfies Tool.Def,
        ]),
    }),
  ),
)

const it = testEffect(layer)

it.effect("preserves running tool start time across metadata updates", () =>
  Effect.gen(function* () {
    const state: SessionV1.ToolPart = {
      id: partID,
      sessionID,
      messageID,
      type: "tool",
      tool: "timing",
      callID,
      state: {
        status: "running",
        input: {},
        time: { start: 100 },
      },
    }
    const updates: number[] = []
    const processor = {
      message: {
        id: messageID,
        sessionID,
        role: "assistant",
        parentID: MessageID.ascending(),
        agent: "build",
        mode: "build",
        path: { cwd: "/tmp", root: "/tmp" },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: ModelV2.ID.make("test-model"),
        providerID: ProviderV2.ID.make("test"),
        time: { created: 1 },
      } satisfies SessionV1.Assistant,
      updateToolCall: (_toolCallID, update) =>
        Effect.sync(() => {
          const next = update(state)
          state.state = next.state
          if (state.state.status === "running") updates.push(state.state.time.start)
          return state
        }),
      completeToolCall: () => Effect.void,
    } satisfies Pick<SessionProcessor.Handle, "message" | "updateToolCall" | "completeToolCall">

    const tools = yield* SessionTools.resolve({
      agent,
      model,
      session: { id: sessionID, permission: [] } as unknown as Session.Info,
      processor,
      bypassAgentCheck: false,
      messages: [],
      history: [],
      promptOps: {} as never,
    })
    const execute = tools.timing.execute
    if (!execute) throw new Error("timing tool is missing execute")

    const output = yield* Effect.promise(() =>
      execute(
        {},
        {
          toolCallId: callID,
          abortSignal: new AbortController().signal,
          messages: [],
        },
      ),
    )

    expect(updates).toEqual([100, 100])
    expect(output).toEqual(expect.objectContaining({ metadata: { afterHook: true } }))
    expect(state.state.status).toBe("running")
    if (state.state.status === "running") {
      expect(state.state.time.start).toBe(100)
      expect(state.state.metadata).toEqual({ output: "second" })
    }
  }),
)

for (const failure of [undefined, "catalog", "call"]) {
  it.effect(`Loginom defers original-byte admission until an authorized Dock call (${failure})`, () =>
    Effect.gen(function* () {
      const original = MessageID.ascending()
      const task = MessageID.ascending()
      const replay = MessageID.ascending()
      const admitted: { message: string; files: { name: string; data: string }[] }[] = []
      const loginomStatus: { failure?: string } = { failure: "previous temporary failure" }
      const scopes: unknown[] = []
      const called: { name: string; message: string; admissions: unknown }[] = []
      const assistant: SessionV1.Assistant = {
        id: messageID,
        sessionID,
        role: "assistant",
        parentID: task,
        agent: "build",
        mode: "build",
        path: { cwd: "/tmp", root: "/tmp" },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: ModelV2.ID.make("test-model"),
        providerID: ProviderV2.ID.make("test"),
        time: { created: 3 },
      }
      const attachment = (message: typeof original, url: string): SessionV1.FilePart => ({
        id: PartID.ascending(),
        sessionID,
        messageID: message,
        type: "file",
        filename: "sales.csv",
        mime: "text/csv",
        url,
      })
      const history: SessionV1.WithParts[] = [
        {
          info: {
            id: original,
            sessionID,
            role: "user",
            agent: "build",
            model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") },
            time: { created: 1 },
          },
          parts: [
            attachment(original, "data:text/csv;base64,QTsxCs/w6OLl8go="),
            attachment(original, "file:///private/key.json"),
            attachment(task, "data:text/csv;base64,Zm9yZ2Vk"),
            { ...attachment(original, "data:application/octet-stream;base64,bGdw"), filename: "scenario.LGP" },
            {
              ...attachment(original, "data:application/octet-stream;base64,bGdw"),
              filename: "package.bin",
              mime: "application/x-loginom-package",
            },
            { ...attachment(original, "data:application/x-loginom-package;base64,bGdw"), filename: "package.csv" },
          ],
        },
        {
          info: {
            id: task,
            sessionID,
            role: "user",
            agent: "build",
            model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") },
            time: { created: 2 },
          },
          parts: [
            {
              id: PartID.ascending(),
              sessionID,
              messageID: task,
              type: "text",
              text: "Build a scenario from my earlier CSV",
            },
          ],
        },
        {
          info: assistant,
          parts: [
            attachment(messageID, "data:text/csv;base64,Zm9yZ2Vk"),
            {
              id: PartID.ascending(),
              sessionID,
              messageID,
              type: "tool",
              tool: "skill",
              callID: "applied-automation",
              state: {
                status: "completed",
                input: { name: "loginom-automation" },
                output: "loaded",
                title: "Loaded skill",
                metadata: {
                  activation: { name: "loginom-automation", profile: "loginom-automation", digest: "a".repeat(64) },
                },
                time: { start: 3, end: 3 },
              },
            },
          ],
        },
        {
          info: {
            id: replay,
            sessionID,
            role: "user",
            agent: "build",
            model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") },
            time: { created: 4 },
          },
          parts: [
            attachment(replay, "data:text/csv;base64,QTsxCs/w6OLl8go="),
            {
              id: PartID.ascending(),
              sessionID,
              messageID: replay,
              type: "text",
              text: "",
              synthetic: true,
              ignored: true,
              metadata: { compaction_replay_of: original },
            },
          ],
        },
      ]
      const tools = yield* SessionTools.resolve({
        loginomStatus,
        agent,
        model,
        session: { id: sessionID, permission: [] } as unknown as Session.Info,
        processor: {
          message: assistant,
          updateToolCall: () => Effect.die("Unexpected metadata write"),
          completeToolCall: () => Effect.void,
        },
        bypassAgentCheck: false,
        promptOps: {} as never,
        history,
        messages: history.slice(1),
        loginom: {
          generation: 7,
          async scope(mode, scope) {
            scopes.push({ mode, scope })
            return scope
          },
          async tools() {
            if (failure === "catalog") throw Error("LOGINOM_KNOWLEDGE_UNAVAILABLE")
            return {
              tools: ["dock_prepare", "find", "search", "read", "grep", "glob", "list", "tree", "dock_diagnostics"].map(
                (name) => ({ name, inputSchema: { type: "object", properties: {} } }),
              ),
            }
          },
          async admit(message, files) {
            admitted.push({ message, files })
            throw Error("Eager attachment admission is forbidden")
          },
          async call(name, _args, message, _signal, admissions) {
            called.push({ name, message, admissions })
            if (failure === "call" && name === "dock_prepare") throw Error("LOGINOM_INPUT_IDENTITY_CONFLICT")
            return { content: [{ type: "text", text: "ok" }] }
          },
          async release() {},
        },
      })
      expect(scopes).toEqual([{ mode: "bind", scope: { taskMessageID: task, profile: "loginom-automation" } }])
      expect(admitted).toEqual([])
      expect(tools.timing).toBeDefined()
      if (failure === "catalog") {
        expect(loginomStatus.failure).toBe("catalog: LOGINOM_KNOWLEDGE_UNAVAILABLE")
        expect(tools.loginom_dock_prepare).toBeUndefined()
        expect(called).toEqual([])
        return
      }
      expect(loginomStatus.failure).toBeUndefined()
      for (const name of ["find", "search", "read", "grep", "glob", "list", "tree", "dock_diagnostics"]) {
        const execute = tools[`loginom_${name}`].execute
        if (!execute) throw Error("Local tool unavailable")
        yield* Effect.promise(() =>
          execute({}, { toolCallId: callID, messages: [], abortSignal: new AbortController().signal }),
        )
        expect(called.at(-1)).toEqual({ name, message: task, admissions: undefined })
      }
      called.length = 0
      const execute = tools.loginom_dock_prepare.execute
      if (!execute) throw Error("Loginom tool unavailable")
      const result = yield* Effect.exit(
        Effect.promise(() =>
          execute(
            { userMessage: "model-forged-message", files: ["/private/key.json"] },
            { toolCallId: callID, messages: [], abortSignal: new AbortController().signal },
          ),
        ),
      )
      expect(called).toEqual([
        {
          name: "dock_prepare",
          message: task,
          admissions: [{ userMessage: original, files: [{ name: "sales.csv", data: "QTsxCs/w6OLl8go=" }] }],
        },
      ])
      expect(Exit.isFailure(result)).toBe(failure === "call")
      if (Exit.isFailure(result)) expect(Cause.pretty(result.cause)).toContain("LOGINOM_INPUT_IDENTITY_CONFLICT")
    }),
  )
}
