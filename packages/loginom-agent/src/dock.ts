// The Dock catalog of the Loginom Host (B2.5d). Ported from 0.4 `packages/opencode/src/product/tool-contributor.ts`
// (`contribute`), the task binding of 0.4 `session/tools.ts` and the model hints of 0.4 `turnLifecycle.system`.
//
// 0.4 built the session's tools on every turn: it bound the Host run to the task, read the Host catalog and offered each
// tool as `loginom_<name>`. OpenCode 2 takes the tool snapshot before any hook of the step runs, and a hook cannot add
// a tool the registry does not have. So the plugin keeps the tools of the current connection generation in its registry
// (`registry`), reloads it when the catalog changes, and each session sees only what its own Host run offers
// (`catalogs`); the access gate (B2.2) still decides by the task's profile.
import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { extname, join, resolve } from "node:path"
import { hostErrorText } from "@loginom-ai-agent/loginom-host/errors"
import { SessionV1 } from "@loginom-ai-agent/loginom-host/session-v1"
import type { Plugin } from "@opencode/plugin"
import type { SessionContext } from "@opencode/plugin/promise/session"
import type { Info, ToolContext } from "@opencode/plugin/promise/tool"
import { Identifier } from "@opencode/schema/identifier"
import type { Model } from "@opencode/schema/model"
import { Tool } from "@opencode/schema/tool"
import { Global } from "@opencode/util/global"
import { Schema } from "effect"
import { local, type Profile } from "./access"
import { exactScanReceipt } from "./file-profile-core"
import type { ServiceHost } from "./host"
import { permissionFailure, type localFiles } from "./local-file"
import { loginomResultState, loginomResultSummary } from "./loginom-result"

type Lease = ServiceHost.Lease
type Files = Awaited<ReturnType<typeof localFiles>>
type Definition = (typeof Catalog.Type.tools)[number]

const Catalog = Schema.Struct({
  tools: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      description: Schema.optional(Schema.String),
      inputSchema: Schema.Record(Schema.String, Schema.Unknown),
    }),
  ),
})
const Reply = Schema.Struct({
  content: Schema.Array(Schema.Record(Schema.String, Schema.Unknown)),
  structuredContent: Schema.optional(Schema.Unknown),
  isError: Schema.optional(Schema.Boolean),
  _meta: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
})
const decodeCatalog = Schema.decodeUnknownSync(Catalog)
const decodeReply = Schema.decodeUnknownSync(Reply)

// The product's own tools that 0.4 offered only beside a prepared Dock: the catalog then describes Dock actions.
const prepared = ["loginom_file_admit", "loginom_file_profile", "loginom_file_scan", "loginom_file_sample"]
// OpenCode's default tool result limits (`core/src/tool-output.ts`); a larger Dock reply keeps its control summary.
const limits = { lines: 2_000, bytes: 50 * 1024 }

const available =
  "Loginom is available through the bundled loginom_* tools. To create, change or execute a scenario, first activate the bundled loginom-automation skill. Browser Loginom tools are available after activation; then use loginom_dock_prepare for dynamic readiness and input artifacts. Help and diagnostics do not require loginom_dock_prepare. For a documentation-only request about a Loginom scenario, always activate package-docs before replying, including when the local .lgp is missing or only a server package is named. Then request the missing local package; never search for it in the browser. Dock tool names in skills have the loginom_ prefix here. Connection credentials are managed privately by the desktop; never ask the model to enter or reveal them."
const unavailable = (failure: string) =>
  "Loginom tools are currently unavailable (" +
  failure +
  "). No new Loginom action was dispatched by this failed preparation. Report this concrete failure and preserve the existing scenario. Attachment admission is not confirmed by the presence of a chat attachment; do not claim input_artifacts were admitted or uploaded. After connection/recovery is resolved, continue in the same chat. Never ask for credentials in chat or substitute fabricated results."

export async function dockTools(input: {
  plugin: Pick<Plugin.Context, "tool" | "location" | "model" | "session">
  files: Files
  profiles: string
  /** The execution's Host lease (B2.3) and why it is missing, if acquiring it failed. */
  lease: (sessionID: string) => Promise<Lease | undefined>
  /** Whether a lease is at hand without waiting for the Host's handshake. */
  ready: () => boolean
  failure: (sessionID: string) => string | undefined
  task: (sessionID: string) => Promise<string>
}) {
  const plugin = input.plugin
  // Every Dock tool of the current connection generation that a session of this Location was offered. A new generation
  // replaces them all; tools of the old one leave the registry.
  const registry = { generation: undefined as number | undefined, tools: new Map<string, Definition>() }
  const registered = new Set<string>()
  // What each session's Host run offered at its latest refresh, or why it offers nothing.
  const catalogs = new Map<string, { names: Set<string>; failure?: string }>()
  // The task and profile each Host run is bound to; a new run is bound to nothing.
  const bound = new WeakMap<Lease, { task: string; profile: Profile }>()

  await plugin.tool.transform((editor) => registry.tools.forEach((definition) => editor.add(tool(definition))))

  // A run serves one task with one profile (`loginom-host/src/host-port.ts`). Its first binding may name the task's
  // profile, as 0.4 bound the profile it derived from history; a later task binds as `default` and then requests and
  // applies its grant, as 0.4 did for a command or a loaded skill. An unchanged binding asks the Host nothing.
  const bind = async (lease: Lease, task: string, profile: Profile, eager: boolean) => {
    const scope = (value: Profile) => ({ taskMessageID: SessionV1.MessageID.make(task), profile: value })
    const current = bound.get(lease)
    if (!current) {
      await lease.scope("bind", scope(profile))
      bound.set(lease, { task, profile })
      return
    }
    if (current.task === task && current.profile === profile) return
    // Outside a step boundary a call of the same run may be in flight, and the Host refuses to rebind then.
    if (eager && current.task !== task) return
    if (current.task !== task) {
      await lease.scope("bind", scope("default"))
      bound.set(lease, { task, profile: "default" })
      if (profile === "default") return
    }
    await lease.scope("request", scope(profile))
    await lease.scope("apply", scope(profile))
    bound.set(lease, { task, profile })
  }

  /**
   * Binds the session's Host run to its task and reads its catalog, as 0.4 did before each turn. The `context` hook does
   * it at every step boundary; a failure there leaves the session without Dock tools and tells the model why. `eager`
   * refreshes (an admitted prompt, a completed tool) only prepare the registry for the next step's tool snapshot and
   * fail silently.
   */
  const refresh = async (sessionID: string, profile: Profile, model: Model.Ref | undefined, eager = false) => {
    // A Host still starting holds up no session: until its handshake the session has no Dock tools, as in 0.4.
    const lease = input.ready() ? await input.lease(sessionID) : undefined
    if (!lease) {
      const failure = input.failure(sessionID)
      if (failure) catalogs.set(sessionID, { names: new Set(), failure })
      else catalogs.delete(sessionID)
      return
    }
    const failed = (phase: string) => (error: unknown) => {
      if (!eager) catalogs.set(sessionID, { names: new Set(), failure: phase + ": " + hostErrorText(error) })
      return undefined
    }
    const scoped = await input
      .task(sessionID)
      .then((task) => bind(lease, task, profile, eager))
      .then(() => true, failed("scope"))
    if (!scoped) return
    const catalog = await lease.tools().then(decodeCatalog).catch(failed("catalog"))
    if (!catalog) return
    // A text-only model keeps working from the DOM instead of an unreadable screenshot (0.4).
    const image = catalog.tools.some((item) => item.name === "browser_take_screenshot") && (await images(model))
    const offered = catalog.tools.filter(
      (item) => item.inputSchema.type === "object" && (item.name !== "browser_take_screenshot" || image),
    )
    catalogs.set(sessionID, { names: new Set(offered.map((item) => `loginom_${item.name}`)) })
    // A run of an earlier generation, still finishing across a reconnect, leaves the registry to the newer one.
    const generation = lease.generation
    if (registry.generation !== undefined && generation < registry.generation) return
    const changed =
      registry.generation !== generation ||
      offered.some((item) => JSON.stringify(registry.tools.get(`loginom_${item.name}`)) !== JSON.stringify(item))
    if (registry.generation !== generation) registry.tools.clear()
    registry.generation = generation
    offered.forEach((item) => {
      registry.tools.set(`loginom_${item.name}`, item)
      registered.add(`loginom_${item.name}`)
    })
    if (changed) await plugin.tool.reload().catch(() => undefined)
  }

  // Hides the Dock tools the session's Host run does not offer, and the product's file tools until it offers Dock actions.
  const hide = (event: Pick<SessionContext, "sessionID" | "tools">) => {
    const names = catalogs.get(event.sessionID)?.names ?? new Set<string>()
    Object.keys(event.tools)
      .filter(
        (name) =>
          (registered.has(name) && !names.has(name)) ||
          (prepared.includes(name) && !names.has("loginom_dock_action_describe")),
      )
      .forEach((name) => delete event.tools[name])
  }

  // 0.4 `turnLifecycle.system`: nothing without a Host, the failure when the Host could not prepare the session.
  const system = (sessionID: string) => {
    const catalog = catalogs.get(sessionID)
    if (!catalog) return []
    return [catalog.failure ? unavailable(catalog.failure) : available]
  }

  const forget = (sessionID: string) => catalogs.delete(sessionID)

  return { refresh, hide, system, forget, registered: (name: string) => registered.has(name) }

  async function images(model: Model.Ref | undefined) {
    if (!model) return false
    const models = await plugin.model.list().then(
      (output) => output.data,
      () => [],
    )
    return models.some(
      (item) =>
        item.providerID === model.providerID && item.id === model.id && item.capabilities.input.includes("image"),
    )
  }

  function tool(definition: Definition): Info {
    const name = definition.name
    const key = `loginom_${name}`
    const schema = definition.inputSchema
    const properties = Object.fromEntries(
      Object.entries((schema.properties as Record<string, unknown> | undefined) ?? {}).filter(
        ([property]) => property !== "host_context_token",
      ),
    )
    return {
      name: key,
      description: definition.description ?? "",
      input: {
        ...schema,
        properties: {
          ...properties,
          ...(name === "dock_prepare"
            ? {
                local_package_path: {
                  type: "string",
                  minLength: 1,
                  description:
                    "Local .lgp path for intent open_package, instead of server package_path; incompatible with workflow_ref. The backend authorizes and snapshots the file.",
                },
              }
            : {}),
        },
        required: (schema.required as string[] | undefined)?.filter((item) => item !== "host_context_token"),
      },
      options: { codemode: false },
      execute: (args, call) => execute(name, (args ?? {}) as Record<string, unknown>, call),
    }
  }

  async function execute(name: string, args: Record<string, unknown>, call: ToolContext): Promise<Tool.Result> {
    const key = `loginom_${name}`
    const lease = await input.lease(call.sessionID)
    if (!lease) throw Error(hostErrorText("LOGINOM_HOST_NOT_READY"))
    const directory = plugin.location.directory
    const localPackage = name === "dock_prepare" && Object.hasOwn(args, "local_package_path")
    if (localPackage) {
      if (typeof args.local_package_path !== "string" || !args.local_package_path.length)
        throw Error("local_package_path must be a non-empty local path")
      if (args.intent !== "open_package" || args.package_path !== undefined || args.workflow_ref !== undefined)
        throw Error(
          "local_package_path requires open_package without package_path or workflow_ref. Путь: " +
            resolve(directory, args.local_package_path),
        )
    }
    const packagePath = localPackage ? (args.local_package_path as string) : undefined
    // The resource tells the product's permission kinds apart (B2.6a): an uploaded local package is a save, an export
    // node writes outside the package.
    const target = name === "dock_node_apply" ? (args.target as { type?: unknown } | undefined)?.type : undefined
    const resource = localPackage ? "local_package" : typeof target === "string" ? target : "*"
    await input.files.ask(call, { action: key, resources: [resource], save: ["*"] }).catch((error) => {
      throw packagePath ? permissionFailure(resolve(directory, packagePath), error) : error
    })
    const forwarded = { ...args }
    const packageInput = packagePath
      ? await (async () => {
          const source = await input.files.snapshot(packagePath, call)
          if (extname(source.file.name).toLowerCase() !== ".lgp")
            throw Error("local_package_path requires a .lgp file. Путь: " + source.sourcePath)
          delete forwarded.local_package_path
          if (forwarded.operation_id === undefined) forwarded.operation_id = randomUUID()
          return { admissionID: JSON.stringify(["local-file", call.messageID, call.id]), file: source.file }
        })()
      : undefined
    const parameters = args.parameters as { source_switch?: { profile_id?: unknown } } | undefined
    const profileID = name === "dock_node_apply" ? parameters?.source_switch?.profile_id : undefined
    const scanReceipt =
      typeof profileID === "string"
        ? await exactScanReceipt(profileID, join(input.profiles, call.sessionID)).catch(() => undefined)
        : undefined
    // The task the run is bound to, as 0.4 dispatched with the turn's task.
    const task = bound.get(lease)?.task ?? (await input.task(call.sessionID))
    const result = await lease
      .call(
        name,
        forwarded,
        task,
        call.signal,
        // Help and connection diagnostics carry no attachments (0.4 `toolPolicy.isLocalLoginom`).
        local.has(key) ? undefined : await admissions(call.sessionID),
        packageInput,
        scanReceipt,
      )
      .then(decodeReply)
      .catch((error) => {
        throw Error(hostErrorText(error))
      })
    const text = result.content
      .flatMap((block) => (block.type === "text" && typeof block.text === "string" ? [block.text] : []))
      .join("\n\n")
    const state = loginomResultState(result as Parameters<typeof loginomResultState>[0])
    const summary = oversized(text)
      ? loginomResultSummary(result as Parameters<typeof loginomResultSummary>[0])
      : undefined
    const outputPath = summary ? await retain(text) : undefined
    const content =
      summary && outputPath
        ? `${summary}\n\nTable data and verbose details were omitted by the backend response limit. The complete original result is retained at ${outputPath}. Do not infer unread data or repeat mutations solely to retrieve omitted text.`
        : text
    if (state === "failed")
      throw new Tool.Error({
        message: content || "LOGINOM_TOOL_FAILED",
        metadata: { generation: lease.generation, isError: true },
      })
    const images = result.content.flatMap((block) =>
      block.type === "image" && typeof block.data === "string" && typeof block.mimeType === "string"
        ? [{ type: "file" as const, uri: `data:${block.mimeType};base64,${block.data}`, mime: block.mimeType }]
        : [],
    )
    return {
      content: images.length ? [{ type: "text", text: content }, ...images] : content,
      metadata: {
        generation: lease.generation,
        ...(Array.isArray(result._meta?.outputFiles) ? { outputFiles: result._meta.outputFiles } : {}),
        // A reply within OpenCode's limits is left to it; a larger one with a control summary was shortened here.
        ...(outputPath ? { truncated: true, outputPath } : {}),
        ...(state === "pending" ? { loginomPending: true } : {}),
      },
    }
  }

  // Inline attachments of the session's user messages reach a Dock call as eager admissions, as 0.4 admitted `data:`
  // file parts; a package goes through `local_package_path`, and a file on disk through `loginom_file_admit`.
  async function admissions(sessionID: string) {
    const history = await plugin.session.context({ sessionID })
    return history.flatMap((message) => {
      if (message.type !== "user") return []
      const files = (message.files ?? []).flatMap((file) =>
        file.source.type !== "inline" ||
        !file.name ||
        file.name.toLowerCase().endsWith(".lgp") ||
        file.mime.toLowerCase().split(";")[0] === "application/x-loginom-package"
          ? []
          : [{ name: file.name, data: file.data }],
      )
      return files.length ? [{ userMessage: message.id, files }] : []
    })
  }
}

function oversized(text: string) {
  return text.split("\n").length > limits.lines || Buffer.byteLength(text, "utf8") > limits.bytes
}

// Where OpenCode keeps a truncated tool result, so its retention removes this one too.
async function retain(text: string) {
  const directory = join(Global.Path.data, "tool-output")
  const file = join(directory, "tool_" + Identifier.create(false))
  return mkdir(directory, { recursive: true })
    .then(() => writeFile(file, text))
    .then(
      () => file,
      () => undefined,
    )
}
