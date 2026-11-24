// Loginom AI Agent product plugin. Core runs it as a built-in server plugin: last in `post`, with a guarded and
// reserved ID (seam U1, `packages/core/src/plugin/product.ts`). The Host itself belongs to the server process
// (`./host`); this plugin leases it for its sessions (B2.3) and offers its Dock catalog (B2.5d).
import { join } from "node:path"
import { hostErrorText } from "@loginom-ai-agent/loginom-host/errors"
import { Plugin } from "@opencode/plugin"
import type { SessionContext } from "@opencode/plugin/promise/session"
import type { Permission } from "@opencode/schema/permission"
import { Tool } from "@opencode/schema/tool"
import { Global } from "@opencode/util/global"
import { grants, next, permits, type Grant, type Profile } from "./access"
import { BrowserRecovery } from "./browser-recovery"
import { Dashboard } from "./dashboard"
import { DashboardTarget } from "./dashboard-target"
import { dashboardTools } from "./dashboard-tools"
import { dockTools } from "./dock"
import { fileTools } from "./file-profile"
import { ServiceHost } from "./host"
import { localFiles } from "./local-file"
import { packageDocs } from "./package-docs"
import {
  classify,
  declinedText,
  deniedKinds,
  deniedKindsText,
  grantable,
  isDecline,
  kinds,
  ownRead,
  policyDenied,
  refusal,
  refusalMetadata,
  settle,
  table,
  withDefaults,
  type Kind,
} from "./permissions"
import { apply, bundled, hub } from "./skills"

export { Dashboard }

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

// The checks 0.4's product CLI made before the model (B2.7a4b): its `run` asks them of this server's Host before it
// prompts (`ServiceHost.preflight`). The answer is a product code, or none when the run may go on.
const preflight = {
  id: "loginom.preflight",
  methods: {
    check: {
      input: {
        type: "object",
        properties: { automation: { type: "boolean" } },
        required: ["automation"],
        additionalProperties: false,
      },
      output: { type: "object", properties: { code: { type: "string" } }, additionalProperties: false },
    },
  },
  events: {},
} as const

// Prompt metadata key that carries the wizard's one-time token to the `prompt` hook; the hook removes it.
const token = "loginom.runner"
// Permission request metadata key of the product's own check of the rules (B2.6b).
const marker = "loginom.permission.probe"

// «Разрешать в этом разговоре» (B2.6a): the answer to one open request that also allows its kind for the rest of the
// session. The button is stage C.
const permission = {
  id: "loginom.permission",
  methods: {
    conversation: {
      input: {
        type: "object",
        properties: { sessionID: { type: "string" }, requestID: { type: "string" } },
        required: ["sessionID", "requestID"],
        additionalProperties: false,
      },
      output: { type: "object", properties: { kind: { type: "string" } }, required: ["kind"] },
      // The terminal (В-31) and a request the product does not ask by default are answered one at a time.
      errors: {
        not_grantable: { type: "object", properties: { action: { type: "string" } }, required: ["action"] },
      },
    },
  },
  events: {},
} as const

export default Plugin.define({
  id: "loginom.product",
  setup: async (ctx) => {
    // Access grants (G1), keyed by the exact session ID: a subsession, a fork and a scheduled wake run in another
    // session or arrive as a new prompt, so none of them inherits a grant. A grant lives for one task, as in 0.4: from the
    // prompt or skill activation that issued it until the session admits its next prompt. It is not tied to an execution:
    // a scheduled wake joins a running execution as a steer prompt. Memory only, so a restart drops every grant.
    const granted = new Map<string, Profile>()
    const pending = new Map<string, { sessionID: string; profile: Grant }>()
    // A dashboard's work folder confines every session of its Location to `loginom-dashboard` for good (B2.9b, 0.4
    // `baseProfile`): no skill, attachment or wizard grant changes it, and a subsession or a fork lives here too.
    const dashboard = Dashboard.latch(ctx.location.directory)
    const profile = (sessionID: string): Profile =>
      dashboard() ? "loginom-dashboard" : (granted.get(sessionID) ?? "default")
    // A dashboard chat runs only on its own draft (B2.9d): an old chat of a folder that was deleted or prepared again,
    // or one moved in from elsewhere, is refused before its prompt is admitted, before the model and before any tool.
    const binding = Dashboard.binding(ctx, dashboard)
    const bound = async (sessionID: string) => {
      const refused = await binding.refusal(sessionID)
      if (refused) throw new Error(refused)
    }

    // Skill sources (G6): the bundled catalog owns the product's skill IDs and names, so only it grants access.
    const resources = process.env.LOGINOM_AI_AGENT_RESOURCES
    const catalog = await bundled(resources)
    await ctx.skill.transform((editor) => apply(editor, catalog, hub))
    // A dashboard session sees none of its Location's MCP servers: no tools, resources or prompts (0.4 `allowsMcp`).
    await ctx.mcp.transform((editor) => {
      if (dashboard()) editor.list().forEach(([name]) => editor.remove(name))
    })
    // The dashboard's tools exist only in its Location (B2.9e), outside the CodeMode catalog like every tool no other
    // profile permits. Its draft server stops when the plugin unloads.
    const drafts = dashboardTools(ctx.location.directory, resources)
    await ctx.tool.transform((editor) => {
      if (dashboard()) editor.add(drafts.draft)
    })

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
    // is taken when the execution starts (at its first step boundary at the latest), or by the first tool that needs it
    // if that comes first, and released when the execution succeeds, fails or is interrupted; a steer prompt joins the
    // running execution and its lease. A plugin that is disposed releases what it still holds. Without a ready Host the
    // lease is `undefined`. A failed record write only loses that lease: the event loop below must keep running to
    // release the others.
    const leases = new Map<string, Promise<ServiceHost.Lease | undefined>>()
    // Why the Host refused a session's lease; the model is told (B2.5d).
    const refused = new Map<string, string>()
    // A dashboard session never leases the Host (0.4 `turnLifecycle.acquireRun`): without a lease it has no Dock
    // catalog and no Loginom hints either.
    const hold = (sessionID: string) => {
      if (dashboard()) return Promise.resolve(undefined)
      const current =
        leases.get(sessionID) ??
        ServiceHost.acquire(sessionID).then(
          (lease) => {
            refused.delete(sessionID)
            return lease
          },
          (error) => {
            refused.set(sessionID, "acquire: " + hostErrorText(error))
            return undefined
          },
        )
      leases.set(sessionID, current)
      return current
    }
    const drop = async (sessionID: string) => {
      const current = leases.get(sessionID)
      leases.delete(sessionID)
      refused.delete(sessionID)
      offered.delete(sessionID)
      dock.forget(sessionID)
      const lease = await current
      if (lease) await ServiceHost.release(lease).catch(() => undefined)
    }

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

    // Product permissions (B2.6a, `./permissions`): the defaults go into every agent's rules, the hook settles what rules
    // cannot express. It is registered before `localFiles`, whose rules-only check then still turns a remaining `ask`
    // into `allow`. Conversation grants are memory only, keyed by the exact session ID, like access grants: a restart
    // asks again, and a subagent's or a fork's session holds none.
    const subagents = new Set<string>()
    const conversation = new Map<string, Set<Kind>>()
    // The product's own directories outside the project, which the agent reads without the «outside the project»
    // question (B2.6a2): the full text of a large tool result (`<data>/tool-output`, where OpenCode and `dock.ts` keep
    // it), the bundled skills' files and the `plan` agent's plans (the directory of `core/src/plugin/plan.ts`).
    const own = [
      join(Global.Path.data, "tool-output"),
      ...(resources ? [join(resources, "skills")] : []),
      join(Global.Path.home, ".loginom-ai-agent", "plan"),
    ]
    // The tool behind a running call (`<message> <call>`), so the hook can tell a read from a write.
    const calls = new Map<string, string>()
    // The tools each session's latest request offered the model (B2.6b).
    const offered = new Map<string, Set<string>>()
    // The product's defaults and settings: the rules of the default agent `build`, which has none of its own (B2.6b2).
    const settings: Permission.Rule[] = []
    await ctx.agent.transform((editor) => {
      subagents.clear()
      editor.list().forEach((agent) => {
        if (agent.mode === "subagent") subagents.add(agent.id)
        editor.update(agent.id, (item) => {
          item.permissions.splice(
            0,
            item.permissions.length,
            ...withDefaults(item.permissions).map((rule) => ({ ...rule })),
          )
          if (item.id === "build") settings.splice(0, settings.length, ...item.permissions.map((rule) => ({ ...rule })))
        })
      })
    })
    // A check of the rules and the administrator's policy (B2.6b, B2.6c): the hook answers its marker without a question,
    // so only a rule's deny or the policy's fails it. Once the Location shuts down, `Permission.assert` dies with a
    // decline instead.
    const probe = crypto.randomUUID()
    const rules = (
      call: { sessionID: string; agent?: string; messageID?: string; id?: string },
      action: string,
      resources = ["*"],
    ) =>
      ctx.permission
        .assert({
          sessionID: call.sessionID,
          agent: call.agent,
          action,
          resources,
          ...(call.messageID && call.id ? { source: { type: "tool", messageID: call.messageID, id: call.id } } : {}),
          metadata: { [marker]: probe },
        })
        .then(
          () => undefined,
          (error: unknown) => error,
        )
    await ctx.permission.hook("evaluate", async (event) => {
      if (event.metadata?.[marker] === probe) {
        // The policy's deny arrives from OpenCode's hook, which runs before this one (B2.6c).
        if (event.effect !== "deny") event.effect = "allow"
        return
      }
      // A dashboard session reaches nothing outside its work folder and writes only in `src`, without a question
      // (B2.9c). It is settled before `settle`, whose own directories (`ownRead`) are outside. A deny that arrives here
      // is the administrator's policy (B2.6c), and it stays. The draft is checked again here, the last step before
      // OpenCode reads or writes the file (B2.9d).
      const live = dashboard() && event.effect !== "deny"
      const refused = live ? await binding.refusal(event.sessionID) : undefined
      const word = refused
        ? { effect: "deny" as const, message: refused }
        : live
          ? Dashboard.settle(ctx.location.directory, event)
          : undefined
      if (word) {
        event.effect = word.effect
        if ("message" in word) event.message = word.message
        return
      }
      const tool = event.source ? calls.get(`${event.source.messageID} ${event.source.id}`) : undefined
      const settled = settle(
        event,
        event.agent !== undefined && subagents.has(event.agent),
        conversation.get(event.sessionID) ?? new Set(),
        ownRead(tool, event, own),
      )
      event.effect = settled.effect
      if (settled.message) event.message = settled.message
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

    // The Dock catalog of the session's Host run (B2.5d): its tools come and go with the connection generation. The
    // `context` hook binds the run to the task and reads the catalog at every step boundary, as 0.4 did every turn; an
    // admitted prompt and a completed grant or Dock call read it ahead, so the next step's tool snapshot already has it.
    const dock = await dockTools({
      plugin: ctx,
      files,
      profiles,
      lease: hold,
      // Before the Host's handshake every lease, even one already asked for, would wait for it.
      ready: () => ServiceHost.connected(),
      failure: (sessionID) => refused.get(sessionID),
      task,
    })

    // The lease events start once the catalog that `drop` clears exists.
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

    // Hide what the task may not use, in every request that offers tools, and reject a call that names it anyway.
    const hide = (event: SessionContext) => {
      const current = profile(event.sessionID)
      Object.keys(event.tools)
        .filter((name) => !permits(current, name))
        .forEach((name) => delete event.tools[name])
      dock.hide(event)
    }
    await ctx.session.hook("context", async (event) => {
      await bound(event.sessionID)
      // The execution's lease, without waiting for a Host still in its handshake. `session.execution.started` cannot be
      // relied on for it: an execution that starts while the Location's plugins are still activating (a synthetic wake,
      // a resume) publishes it before this plugin's `setup` subscribes; its first step waits for the activation (B2.6a2).
      void hold(event.sessionID)
      await dock.refresh(event.sessionID, profile(event.sessionID), event.model)
      hide(event)
      offered.set(event.sessionID, new Set(Object.keys(event.tools)))
      dock.system(event.sessionID).forEach((text) => event.system.push({ type: "text", text }))
      // The kinds the settings deny, named before the model tries them: OpenCode does not offer their tools (B2.6b2).
      const session = await ctx.session.get({ sessionID: event.sessionID })
      const denied = deniedKinds([...settings, ...(session.permissions ?? [])])
      if (denied.length > 0) event.system.push({ type: "text", text: deniedKindsText(denied) })
    })
    await ctx.session.hook("compaction", async (event) => {
      await bound(event.sessionID)
      hide(event)
    })
    await ctx.session.hook("generate", async (event) => {
      await bound(event.sessionID)
      hide(event)
    })
    await ctx.tool.hook("execute.before", async (event) => {
      await bound(event.sessionID)
      if (!permits(profile(event.sessionID), event.tool))
        throw new Error(`LOGINOM_SCOPE_DENIED: tool ${event.tool} is not available in this task`)
      // A dashboard session's file tools stay in its work folder (B2.9c); a client counts the refusal as a denied
      // permission, as it counts the hook's (`permission.rejected`).
      const reason = dashboard() ? Dashboard.callError(ctx.location.directory, event.tool, event.input) : undefined
      if (reason) throw new Tool.Error({ message: Dashboard.deniedText(reason), metadata: { permissionDenied: true } })
      // OpenCode does not offer a tool whose action the rules deny outright, and fails a call to it as unknown. A model
      // that calls it anyway (the bundled skill names `loginom_dock_action_run`) is told why (B2.6b).
      const offer = offered.get(event.sessionID)
      const action =
        offer && !offer.has(event.tool)
          ? ((await ctx.tool.list()).find((tool) => tool.id === event.tool)?.options?.permission ?? event.tool)
          : undefined
      const error =
        action !== undefined && classify(action, [])?.resource === "*" ? await rules(event, action) : undefined
      const text = error instanceof Tool.Error ? refusal(error.error) : undefined
      if (text) throw new Tool.Error({ message: text, metadata: refusalMetadata(text) })
      calls.set(`${event.messageID} ${event.id}`, event.tool)
    })

    // The agent grants itself access in an ordinary conversation by loading a bundled product skill (decision 11).
    await ctx.tool.hook("execute.after", async (event) => {
      calls.delete(`${event.messageID} ${event.id}`)
      // The folder may have been prepared again while the call ran: its result does not reach the old chat (B2.9d,
      // 0.4 checked after a read). A write that already landed cannot be undone.
      if (dashboard() && event.status === "completed") {
        const refused = await binding.refusal(event.sessionID)
        if (refused) {
          event.result = { content: refused }
          return
        }
      }
      if (event.status === "error") {
        // The user's «Отклонить» and a rule's deny reach the model as text, so it explains and the turn goes on (B2.6b,
        // В-75). A Location that shuts down (a reload) cancels its open questions with the same decline; that one stays.
        const text = refusal(event.error.error)
        if (!text || (text === declinedText && isDecline(await rules(event, marker)))) return
        event.error = new Tool.Error({ message: text, metadata: { ...event.error.metadata, ...refusalMetadata(text) } })
        return
      }
      if (event.tool === "skill") {
        const current = profile(event.sessionID)
        const requested = next(current, (event.input as { id?: unknown } | undefined)?.id)
        if (requested === "default" || requested === current) return
        granted.set(event.sessionID, requested)
      }
      if (event.tool === "skill" || dock.registered(event.tool))
        await dock.refresh(event.sessionID, profile(event.sessionID), undefined, true)
    })

    // Every admitted prompt starts a new task. It holds a grant only when the user attached a bundled product skill or
    // the wizard issued it; a scheduled wake and a subagent prompt carry text only.
    await ctx.session.hook("prompt", async (event) => {
      await bound(event.sessionID)
      // An attached agent asks for a subagent, which a dashboard session does not run (0.4 refused its subtask).
      if (event.prompt.agents?.length && dashboard())
        throw new Error("LOGINOM_SCOPE_DENIED: a dashboard session does not run subagents")
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
      await dock.refresh(event.sessionID, requested, undefined, true)
    })
    await ctx.session.hook("fork", async (event) => {
      granted.delete(event.sessionID)
      await binding.fork(event.sessionID)
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
    await ctx.rpc.register(preflight, {
      check: async (value) => {
        const code = await ServiceHost.preflight((value as { automation: boolean }).automation)
        return code ? { code } : {}
      },
    })
    // A dashboard's folder before its chat (B2.9h): Desktop and the CLI ask on the Location of their own working directory.
    await ctx.rpc.register(DashboardTarget.rpc, {
      prepare: (value, call) => DashboardTarget.answer(value as { id: string; defer: boolean }, resources, call.signal),
      find: async (value) => ({ found: await DashboardTarget.find((value as { id: string }).id, Dashboard.root()) }),
    })
    await ctx.rpc.register(permission, {
      conversation: async (value, call) => {
        const input = value as { sessionID: string; requestID: string }
        const request = await ctx.permission.get(input)
        const entry = classify(request.action, request.resources)
        if (!entry || !grantable(entry))
          return call.error("not_grantable", `${request.action} is asked for every time`, { action: request.action })
        // A kind the administrator's policy denies, whole or in one of its entries, is a locked row: its requests are
        // answered one at a time (B2.6c, ux-spec «строки с замком в разговоре не разрешить»).
        const checks = await Promise.all(
          [
            { action: request.action, resources: [...request.resources] },
            ...table
              .filter((item) => item.kind === entry.kind)
              .map((item) => ({ action: item.action, resources: [item.resource] })),
          ].map((item) => rules({ sessionID: input.sessionID }, item.action, item.resources)),
        )
        if (checks.some((error) => error instanceof Tool.Error && policyDenied(error.error)))
          return call.error("not_grantable", `the administrator's policy sets «${kinds[entry.kind]}»`, {
            action: request.action,
          })
        conversation.set(input.sessionID, new Set([...(conversation.get(input.sessionID) ?? []), entry.kind]))
        // The request itself and the session's other open requests the grant now covers are answered once; nothing is
        // saved for the project, unlike OpenCode's `always`.
        const open = await ctx.permission.list({ sessionID: input.sessionID })
        await Promise.all(
          open
            .filter((item) => {
              const other = classify(item.action, item.resources)
              return item.id === request.id || (grantable(other) && other?.kind === entry.kind)
            })
            .map((item) => ctx.permission.reply({ sessionID: input.sessionID, requestID: item.id, decision: "once" })),
        )
        return { kind: entry.kind }
      },
    })

    return async () => {
      stop.abort()
      await Promise.all([...leases.keys()].map(drop))
      await drafts.close()
    }
  },
})
