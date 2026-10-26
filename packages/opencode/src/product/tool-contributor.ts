import { LoginomHost } from "@loginom-ai-agent/loginom-host/adapter"
import { hostError } from "@loginom-ai-agent/loginom-host/errors"
import { CallToolResultSchema, ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js"
import { type Tool as AITool, type JSONSchema7, tool, jsonSchema, type ToolExecutionOptions } from "ai"
import { Effect } from "effect"
import type { Agent } from "@/agent/agent"
import type { EffectBridge } from "@/effect/bridge"
import type { Plugin } from "@/plugin"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import type { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import { loginomResultState, loginomResultSummary } from "@/session/loginom-result"
import { PartID } from "@/session/schema"
import type { SessionProcessor } from "@/session/processor"
import { TaskScope } from "@/session/task-scope"
import { Tool } from "@/tool/tool"
import type { Truncate } from "@/tool/truncate"
import { toolPolicy } from "./tool-policy"

export type ContributeInput = {
  tools: Record<string, AITool>
  loginom?: Awaited<ReturnType<typeof LoginomHost.acquire>>
  loginomStatus?: { failure?: string }
  agent: Agent.Info
  model: Provider.Model
  processor: Pick<SessionProcessor.Handle, "message" | "updateToolCall" | "completeToolCall">
  history: ReturnType<typeof TaskScope.visible>
  task: TaskScope.Info | undefined
  profile: TaskScope.Profile
  run: Effect.Success<ReturnType<typeof EffectBridge.make>>
  plugin: Plugin.Service["Service"]
  truncate: Truncate.Service["Service"]
  context: (args: Record<string, unknown>, options: ToolExecutionOptions) => Tool.Context
}

const contribute = Effect.fnUntraced(function* (input: ContributeInput) {
  const { tools, history, task, profile, run, plugin, truncate, context } = input
  const loginom = input.loginom
  if (loginom) {
    if (input.loginomStatus) delete input.loginomStatus.failure
    const failed = (phase: string, error: unknown) => {
      if (input.loginomStatus) input.loginomStatus.failure = phase + ": " + hostError(error)
    }
    const catalog = yield* Effect.promise(() =>
      loginom
        .tools()
        .then((value) => ListToolsResultSchema.parse(value))
        .catch((error) => {
          failed("catalog", error)
          return undefined
        }),
    )
    if (!catalog) return
    const admissions = history.flatMap((message) => {
      if (message.info.role !== "user" || TaskScope.replayOf(message)) return []
      const files = message.parts.flatMap((part) => {
        if (
          part.type !== "file" ||
          !part.url.startsWith("data:") ||
          !part.filename ||
          part.filename.toLowerCase().endsWith(".lgp") ||
          part.mime.toLowerCase().split(";")[0] === "application/x-loginom-package"
        )
          return []
        const match = part.url.match(/^data:([^,]*);base64,([A-Za-z0-9+/=]*)$/)
        if (!match || match[1].toLowerCase().split(";")[0] === "application/x-loginom-package") return []
        return [{ name: part.filename, data: match[2] }]
      })
      return files.length ? [{ userMessage: message.info.id, files }] : []
    })
    if (task && catalog)
      for (const definition of catalog.tools) {
        if (!toolPolicy.permitsLoginom(profile, definition.name)) continue
        // Browser recovery screenshots reach the model as real image content; a
        // text-only model keeps working from the DOM instead of an unreadable image.
        if (definition.name === "browser_take_screenshot" && !input.model.capabilities.input.image) continue
        const key = `loginom_${definition.name}`
        tools[key] = tool({
          description: definition.description,
          inputSchema: jsonSchema(
            ProviderTransform.schema(input.model, {
              ...definition.inputSchema,
              properties: Object.fromEntries(
                Object.entries(definition.inputSchema.properties ?? {}).filter(
                  ([name]) => name !== "host_context_token",
                ),
              ),
              required: definition.inputSchema.required?.filter((name) => name !== "host_context_token"),
            } as JSONSchema7),
          ),
          execute(args, options) {
            return run.promise(
              Effect.gen(function* () {
                if (!toolPolicy.permitsLoginom(profile, definition.name)) return yield* Effect.die(toolPolicy.denied())
                const ctx = context(args, options)
                yield* plugin.trigger(
                  "tool.execute.before",
                  { tool: key, sessionID: ctx.sessionID, callID: options.toolCallId },
                  { args },
                )
                yield* ctx.ask({ permission: key, metadata: {}, patterns: ["*"], always: ["*"] })
                const result = yield* Effect.promise(async () =>
                  CallToolResultSchema.parse(
                    await loginom.call(
                      definition.name,
                      args,
                      task.taskMessageID,
                      options.abortSignal,
                      toolPolicy.isLocalLoginom(definition.name) ? undefined : admissions,
                    ),
                  ),
                )
                yield* plugin.trigger(
                  "tool.execute.after",
                  { tool: key, sessionID: ctx.sessionID, callID: options.toolCallId, args },
                  result,
                )
                const text = result.content.flatMap((block) => (block.type === "text" ? [block.text] : []))
                const truncated = yield* truncate.output(text.join("\n\n"), {}, input.agent)
                const state = loginomResultState(result)
                const summary = truncated.truncated ? loginomResultSummary(result) : undefined
                const content =
                  truncated.truncated && summary
                    ? `${summary}\n\nTable data and verbose details were omitted by the backend response limit. The complete original result is retained at ${truncated.outputPath}. Do not infer unread data or repeat mutations solely to retrieve omitted text.`
                    : truncated.content
                if (state === "failed") {
                  yield* ctx.metadata({
                    title: definition.name,
                    metadata: { generation: loginom.generation, isError: true },
                  })
                  throw new Error(content || "LOGINOM_TOOL_FAILED")
                }
                const output = {
                  title: definition.name,
                  output: content,
                  metadata: {
                    generation: loginom.generation,
                    truncated: truncated.truncated,
                    ...(state === "pending" ? { loginomPending: true } : {}),
                    ...(truncated.truncated ? { outputPath: truncated.outputPath } : {}),
                  },
                  attachments: result.content.flatMap((block) =>
                    block.type === "image"
                      ? [
                          {
                            type: "file" as const,
                            mime: block.mimeType,
                            url: `data:${block.mimeType};base64,${block.data}`,
                            id: PartID.ascending(),
                            sessionID: ctx.sessionID,
                            messageID: input.processor.message.id,
                          },
                        ]
                      : [],
                  ),
                  content: result.content,
                }
                if (options.abortSignal?.aborted) yield* input.processor.completeToolCall(options.toolCallId, output)
                return output
              }),
            )
          },
        })
      }
  }
})

const definitions = Effect.fnUntraced(function* (profile: TaskScope.Profile) {
  if (profile !== "package-docs") return []
  const { PackageDocsTool } = yield* Effect.promise(() => import("@/tool/package-docs"))
  const docs = yield* PackageDocsTool
  return [{ ...(yield* Tool.init(docs)), origin: "builtin" as const }]
})

export const toolContributor = { contribute, definitions }
