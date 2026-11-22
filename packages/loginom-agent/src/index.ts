// Loginom AI Agent product plugin. Core runs it as a built-in server plugin: last in `post`, with a guarded and
// reserved ID (seam U1, `packages/core/src/plugin/product.ts`). The Host itself belongs to the server process
// (`./host`); this plugin leases it for its sessions (B2.3). The Loginom tools arrive in B2.5.
import { join } from "node:path"
import { Plugin } from "@opencode/plugin"
import type { SessionContext } from "@opencode/plugin/promise/session"
import { Global } from "@opencode/util/global"
import { grants, next, permits, type Grant, type Profile } from "./access"
import { BrowserRecovery } from "./browser-recovery"
import { fileTools } from "./file-profile"
import { ServiceHost } from "./host"
import { localFiles } from "./local-file"
import { packageDocs } from "./package-docs"
import { apply, bundled, hub } from "./skills"

// The wizard's RPC: grant a profile to one prompt and admit it. The UI is stage C.
const runner = {
  id: "loginom.runner",
  methods: {
    start: {
      input: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
          profile: { type: "string", enum: [...grants] },
          text: { type: "string" },
        },
        required: ["sessionID", "profile", "text"],
        additionalProperties: false,
      },
      output: { type: "object", properties: { granted: { type: "boolean" } }, required: ["granted"] },
    },
  },
  events: {},
} as const

// Prompt metadata key that carries the wizard's one-time token to the `prompt` hook; the hook removes it.
const token = "loginom.runner"

export default Plugin.define({
  id: "loginom.product",
  setup: async (ctx) => {
    // Access grants (G1), keyed by the exact session ID: a subsession, a fork and a scheduled wake run in another
    // session or arrive as a new prompt, so none of them inherits a grant. A grant lives for one task, as in 0.4: from the
    // prompt or skill activation that issued it until the session admits its next prompt. It is not tied to an execution:
    // a scheduled wake joins a running execution as a steer prompt. Memory only, so a restart drops every grant.
    const granted = new Map<string, Grant>()
    const pending = new Map<string, { sessionID: string; profile: Grant }>()
    const profile = (sessionID: string): Profile => granted.get(sessionID) ?? "default"

    // Skill sources (G6): the bundled catalog owns the product's skill IDs and names, so only it grants access.
    const resources = process.env.LOGINOM_AI_AGENT_RESOURCES
    const catalog = await bundled(resources)
    await ctx.skill.transform((editor) => apply(editor, catalog, hub))

    // A tool that needs a grant never enters the CodeMode catalog, which the model sees without a grant (spike S1).
    // Only tools registered without `codemode: false` are touched: a Promise-API update re-wraps the tool's executor.
    await ctx.tool.transform((editor) => {
      editor
        .list()
        .filter((tool) => tool.options?.codemode !== false && !permits("default", tool.id))
        .forEach((tool) =>
          editor.update(tool.id, (item) => {
            item.options = { namespace: item.options?.namespace, permission: item.options?.permission, codemode: false }
          }),
        )
    })

    // Host lease (B2.3, G3): one Host run per session execution, as 0.4 `turnLifecycle.acquireRun` held one per run. It
    // is taken when the execution starts, or by the first tool that needs it if that comes first, and released when the
    // execution succeeds, fails or is interrupted; a steer prompt joins the running execution and its lease. A plugin
    // that is disposed releases what it still holds. Without a ready Host the lease is `undefined`.
    const leases = new Map<string, Promise<ServiceHost.Lease | undefined>>()
    const hold = (sessionID: string) => {
      const current = leases.get(sessionID) ?? ServiceHost.acquire(sessionID)
      leases.set(sessionID, current)
      return current
    }
    const drop = async (sessionID: string) => {
      const current = leases.get(sessionID)
      leases.delete(sessionID)
      const lease = await current
      if (lease) await ServiceHost.release(lease)
    }
    const stop = new AbortController()
    void (async () => {
      const types = [
        "session.execution.started",
        "session.execution.succeeded",
        "session.execution.failed",
        "session.execution.interrupted",
      ] as const
      for await (const event of ctx.event.subscribe({ types: [...types], signal: stop.signal })) {
        if (event.type === "session.execution.started") void hold(event.data.sessionID)
        else await drop(event.data.sessionID)
      }
    })().catch(() => undefined)

    // The task's user message, which a Host input belongs to: the latest admitted prompt, as for grants. A session this
    // process has not seen a prompt for (resumed after a restart) uses its latest user message.
    const tasks = new Map<string, string>()
    const task = async (sessionID: string) =>
      tasks.get(sessionID) ??
      (await ctx.session.context({ sessionID })).findLast((message) => message.type === "user")?.id ??
      ""

    // Browser recovery (G4), 0.4 `turnLifecycle.endTurn`: when the session would go idle while an attempt still holds the
    // Loginom page, one reminder per attempt keeps the same execution working. A synthetic message is not a prompt, so the
    // task and its grant stay. The second end stops the attempt instead of repeating the instruction.
    await ctx.session.hook("experimental.idle", async (event) => {
      const recovery = BrowserRecovery.active(await ctx.session.context({ sessionID: event.sessionID }))
      if (!recovery) return
      if (!recovery.reminded) {
        await ctx.session.synthetic({
          sessionID: event.sessionID,
          text: BrowserRecovery.reminder(recovery.operationID),
          metadata: { browser_recovery_reminder: recovery.attempt },
        })
        return
      }
      const lease = await leases.get(event.sessionID)
      await lease
        ?.call(
          "dock_browser_recovery",
          {
            action: "stop",
            operation_id: recovery.operationID,
            reason: "The agent ended its turn again without finishing browser recovery.",
          },
          await task(event.sessionID),
        )
        .catch(() => undefined)
    })

    // Local data files for Loginom (B2.5a). `loginom_file_admit` takes the execution's Host lease and answers
    // LOGINOM_HOST_NOT_READY only without one. The file profile tools (B2.5b1) need no Host. Like every `loginom_*` tool,
    // they need the `loginom-automation` grant. `package_docs_run` (B2.5c) needs neither Host nor browser, only the
    // `package-docs` grant.
    const profiles = join(Global.Path.data, "file-profiles")
    const files = await localFiles(ctx, profiles)
    await ctx.tool.transform((editor) => {
      editor.add(
        files.admitTool(async (sessionID) => {
          const host = await hold(sessionID)
          return host && { host, userMessage: await task(sessionID) }
        }),
      )
      fileTools(files, profiles).forEach((tool) => editor.add(tool))
      editor.add(packageDocs(files, ctx.location.directory, resources))
    })

    // Hide what the task may not use, in every request that offers tools, and reject a call that names it anyway.
    const hide = (event: SessionContext) => {
      const current = profile(event.sessionID)
      Object.keys(event.tools)
        .filter((name) => !permits(current, name))
        .forEach((name) => delete event.tools[name])
    }
    await ctx.session.hook("context", hide)
    await ctx.session.hook("compaction", hide)
    await ctx.session.hook("generate", hide)
    await ctx.tool.hook("execute.before", (event) => {
      if (permits(profile(event.sessionID), event.tool)) return
      throw new Error(`LOGINOM_SCOPE_DENIED: tool ${event.tool} is not available in this task`)
    })

    // The agent grants itself access in an ordinary conversation by loading a bundled product skill (decision 11).
    await ctx.tool.hook("execute.after", (event) => {
      if (event.tool !== "skill" || event.status !== "completed") return
      const current = profile(event.sessionID)
      const requested = next(current, (event.input as { id?: unknown } | undefined)?.id)
      if (requested !== "default") granted.set(event.sessionID, requested)
    })

    // Every admitted prompt starts a new task. It holds a grant only when the user attached a bundled product skill or
    // the wizard issued it; a scheduled wake and a subagent prompt carry text only.
    await ctx.session.hook("prompt", (event) => {
      tasks.set(event.sessionID, event.messageID)
      const value = event.metadata?.[token]
      if (event.metadata) delete event.metadata[token]
      const wizard = typeof value === "string" ? pending.get(value) : undefined
      const requested =
        wizard?.sessionID === event.sessionID
          ? wizard.profile
          : (event.prompt.skills ?? []).reduce<Profile>((current, skill) => next(current, skill.id), "default")
      if (requested === "default") granted.delete(event.sessionID)
      else granted.set(event.sessionID, requested)
    })
    await ctx.session.hook("fork", (event) => {
      granted.delete(event.sessionID)
    })

    await ctx.rpc.register(runner, {
      start: async (value) => {
        // The RPC host validates the call against the JSON Schema above before the handler runs.
        const input = value as { sessionID: string; profile: Grant; text: string }
        const key = crypto.randomUUID()
        pending.set(key, { sessionID: input.sessionID, profile: input.profile })
        await ctx.session
          .prompt({ sessionID: input.sessionID, text: input.text, metadata: { [token]: key } })
          .finally(() => pending.delete(key))
        return { granted: true }
      },
    })

    return async () => {
      stop.abort()
      await Promise.all([...leases.keys()].map(drop))
    }
  },
})
