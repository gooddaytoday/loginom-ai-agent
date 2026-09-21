import { expect } from "bun:test"
import { ModelV2 } from "@loginom-ai-agent/core/model"
import { ProviderV2 } from "@loginom-ai-agent/core/provider"
import { SessionV1 } from "@loginom-ai-agent/core/v1/session"
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
import { Effect, Layer, Schema } from "effect"
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
  trigger: (_name, _input, output) => Effect.succeed(output),
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
                yield* ctx.metadata({ metadata: { output: "second" } })
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
      promptOps: {} as never,
    })
    const execute = tools.timing.execute
    if (!execute) throw new Error("timing tool is missing execute")

    yield* Effect.promise(() =>
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
    expect(state.state.status).toBe("running")
    if (state.state.status === "running") {
      expect(state.state.time.start).toBe(100)
    }
  }),
)

for (const failure of [undefined, "catalog", "admission"]) {
  it.effect(`Loginom binds original user bytes and reports preparation failure (${failure})`, () =>
    Effect.gen(function* () {
      const original = MessageID.ascending()
      const admitted: { message: string; files: { name: string; data: string }[] }[] = []
      const loginomStatus: { failure?: string } = { failure: "previous temporary failure" }
      const called: string[] = []
      const assistant: SessionV1.Assistant = {
        id: messageID,
        sessionID,
        role: "assistant",
        parentID: original,
        agent: "build",
        mode: "build",
        path: { cwd: "/tmp", root: "/tmp" },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: ModelV2.ID.make("test-model"),
        providerID: ProviderV2.ID.make("test"),
        time: { created: 2 },
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
        messages: [
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
              attachment(original, "data:text/csv;base64,QTsxCg=="),
              attachment(original, "file:///private/key.json"),
            ],
          },
          { info: assistant, parts: [attachment(messageID, "data:text/csv;base64,Zm9yZ2Vk")] },
        ],
        loginom: {
          generation: 7,
          async tools() {
            if (failure === "catalog") throw Error("LOGINOM_KNOWLEDGE_UNAVAILABLE")
            return { tools: [{ name: "dock_prepare", inputSchema: { type: "object", properties: {} } }] }
          },
          async admit(message, files) {
            admitted.push({ message, files })
            if (failure === "admission") throw Error("Input storage unavailable: private-details-must-not-leak")
          },
          async call(_name, _args, message) {
            called.push(message)
            return { content: [{ type: "text", text: "ok" }] }
          },
          async release() {},
        },
      })
      expect(admitted).toEqual(
        failure === "catalog" ? [] : [{ message: original, files: [{ name: "sales.csv", data: "QTsxCg==" }] }],
      )
      expect(tools.timing).toBeDefined()
      if (failure) {
        expect(loginomStatus.failure).toBe(
          failure === "catalog" ? "catalog: LOGINOM_KNOWLEDGE_UNAVAILABLE" : "admission: LOGINOM_HOST_REQUEST_FAILED",
        )
        expect(tools.loginom_dock_prepare).toBeUndefined()
        expect(called).toEqual([])
        return
      }
      expect(loginomStatus.failure).toBeUndefined()
      const execute = tools.loginom_dock_prepare.execute
      if (!execute) throw Error("Loginom tool unavailable")
      yield* Effect.promise(() =>
        execute(
          { userMessage: "model-forged-message", files: ["/private/key.json"] },
          { toolCallId: callID, messages: [], abortSignal: new AbortController().signal },
        ),
      )
      expect(called).toEqual([original])
    }),
  )
}
