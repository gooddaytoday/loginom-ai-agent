// Spike prototype of the Loginom product plugin on OpenCode 2. Throwaway code: it exists to measure whether the
// v2 plugin API can carry the trust boundary (grants, tool gate, skill source, Host lease), not to ship.
import { Plugin, Skill } from "@opencode/plugin"
import { appendFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

const LOG = process.env.LOGINOM_SPIKE_LOG ?? "/tmp/loginom-spike.jsonl"
const STATE = process.env.LOGINOM_SPIKE_STATE ?? "/tmp/loginom-spike-state"
const BUNDLED = process.env.LOGINOM_SPIKE_BUNDLED_SKILLS ?? ""
const HUB = process.env.LOGINOM_SPIKE_HUB_SKILLS ?? ""
const LEASE_TTL_MS = 3000

// Privileged tools exist only while the session holds a grant. `loginom_dock_codemode` deliberately keeps the
// default `codemode: true`, so the spike can check that the gate also covers calls made inside CodeMode `execute`.
const PRIVILEGED = new Set(["loginom_dock_prepare", "loginom_dock_codemode"])
const RESERVED = new Set(["loginom-automation", "package-docs"])

type Grant = { profile: string; origin: string; at: number }
const grants = new Map<string, Grant>()
const heartbeats = new Map<string, ReturnType<typeof setInterval>>()

function log(event: string, data: Record<string, unknown> = {}) {
  appendFileSync(LOG, JSON.stringify({ t: Date.now(), pid: process.pid, event, ...data }) + "\n")
}

function leaseFile(sessionID: string) {
  return path.join(STATE, `lease-${sessionID}.json`)
}

// Fake Host lease: a file with a heartbeat. A live process refreshes it; a killed one leaves it stale.
function acquireLease(sessionID: string) {
  mkdirSync(STATE, { recursive: true })
  writeFileSync(leaseFile(sessionID), JSON.stringify({ sessionID, acquired: Date.now(), heartbeat: Date.now() }))
  if (!heartbeats.has(sessionID))
    heartbeats.set(
      sessionID,
      setInterval(() => {
        writeFileSync(leaseFile(sessionID), JSON.stringify({ sessionID, heartbeat: Date.now() }))
      }, 500),
    )
  log("lease.acquired", { sessionID })
}

function releaseLease(sessionID: string, reason: string) {
  clearInterval(heartbeats.get(sessionID))
  heartbeats.delete(sessionID)
  rmSync(leaseFile(sessionID), { force: true })
  log("lease.released", { sessionID, reason })
}

// On start, any lease file left by a previous process is either still heartbeating (another live process) or
// stale; a stale one means that process died holding Dock work, so the run must go to requires-recovery.
function recoverStaleLeases() {
  mkdirSync(STATE, { recursive: true })
  for (const name of readdirSync(STATE).filter((item) => item.startsWith("lease-"))) {
    const lease = JSON.parse(readFileSync(path.join(STATE, name), "utf8"))
    const age = Date.now() - lease.heartbeat
    if (age < LEASE_TTL_MS) continue
    rmSync(path.join(STATE, name), { force: true })
    log("lease.requires-recovery", { sessionID: lease.sessionID, age })
  }
}

function within(root: string, file: string | undefined) {
  if (!root || !file) return false
  const relative = path.relative(root, file)
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
}

function readSkill(file: string) {
  const text = readFileSync(file, "utf8")
  const name = /^name:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? path.basename(path.dirname(file))
  const description = /^description:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? ""
  return { name, description, content: text.replace(/^---[\s\S]*?---\n/, "") }
}

function skillsIn(root: string) {
  if (!root) return []
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name, "SKILL.md"))
}

const runner = {
  id: "loginom.runner",
  methods: {
    start: {
      input: {
        type: "object",
        properties: { sessionID: { type: "string" }, text: { type: "string" } },
        required: ["sessionID", "text"],
      },
      output: { type: "object", properties: { granted: { type: "boolean" } } },
    },
    kvProbe: {
      input: { type: "object", properties: { bytes: { type: "number" }, keys: { type: "number" } } },
      output: { type: "object" },
    },
    hubReload: { input: { type: "object" }, output: { type: "object" } },
  },
  events: {
    stage: { schema: { type: "object", properties: { sessionID: { type: "string" }, stage: { type: "string" } } } },
  },
} as const

export default Plugin.define({
  id: "loginom.product",
  async setup(ctx) {
    log("setup", { location: ctx.location.directory })
    recoverStaleLeases()

    await ctx.tool.transform((editor) => {
      editor.add({
        name: "loginom_dock_prepare",
        description: "Prepare Loginom Dock for the attached package (privileged).",
        input: { type: "object", properties: { intent: { type: "string" }, sleep: { type: "number" } } },
        options: { codemode: false },
        execute: async (input, context) => {
          acquireLease(context.sessionID)
          log("tool.executed", { tool: "loginom_dock_prepare", sessionID: context.sessionID, input })
          const sleep = (input as { sleep?: number }).sleep ?? 0
          if (sleep > 0) await new Promise((resolve) => setTimeout(resolve, sleep))
          return { content: "PREPARED" }
        },
      })
      editor.add({
        name: "loginom_dock_codemode",
        description: "Privileged Dock operation registered with the default codemode setting.",
        input: { type: "object", properties: { intent: { type: "string" } } },
        execute: async (input, context) => {
          log("tool.executed", { tool: "loginom_dock_codemode", sessionID: context.sessionID, input })
          return { content: "CODEMODE-EXECUTED" }
        },
      })
      editor.add({
        name: "loginom_request_access",
        description: "Ask the user to grant Loginom access for this task.",
        input: { type: "object", properties: { reason: { type: "string" } } },
        options: { codemode: false },
        execute: async (input, context) => {
          await ctx.permission.assert({
            sessionID: context.sessionID,
            action: "loginom.access",
            resources: ["loginom-automation"],
            metadata: { reason: (input as { reason?: string }).reason ?? "" },
          })
          grants.set(context.sessionID, { profile: "loginom-automation", origin: "access", at: Date.now() })
          log("grant.minted", { sessionID: context.sessionID, origin: "access" })
          return { content: "GRANTED" }
        },
      })
    })

    await ctx.session.hook("context", (event) => {
      const granted = grants.has(event.sessionID)
      if (!granted) for (const name of PRIVILEGED) delete event.tools[name]
      log("context", { sessionID: event.sessionID, granted, tools: Object.keys(event.tools).sort() })
    })

    await ctx.tool.hook("execute.before", (event) => {
      const allowed = !PRIVILEGED.has(event.tool) || grants.has(event.sessionID)
      log("execute.before", { sessionID: event.sessionID, tool: event.tool, allowed })
      if (!allowed) throw new Error(`loginom.product: ${event.tool} requires a Loginom access grant`)
    })

    await ctx.permission.hook("evaluate", (event) => {
      if (event.action === "loginom.access") event.effect = "ask"
      if (event.action === "skill" && grants.has(event.sessionID)) {
        const official = event.resources.every((id) => RESERVED.has(id))
        if (!official) event.effect = "deny"
      }
      log("permission.evaluate", { sessionID: event.sessionID, action: event.action, effect: event.effect })
    })

    // Skill source: only bundled (official) and Hub-managed skills survive; everything discovered from
    // .agents, .claude, project or config roots, and URLs is removed. Non-bundled skills may not use reserved names.
    const bundledSkills = skillsIn(BUNDLED).map((file) => ({ file, ...readSkill(file) }))
    await ctx.skill.transform((editor) => {
      // Re-read the Hub store on every run so `skill.reload()` picks up installs and removals.
      const hubSkills = skillsIn(HUB).map((file) => ({ file, ...readSkill(file) }))
      for (const skill of bundledSkills)
        editor.add(
          Skill.Info.make({
            id: Skill.ID.make(skill.name),
            name: Skill.Name.make(skill.name),
            description: skill.description,
            autoinvoke: false,
            path: Skill.Info.fields.path.make(skill.file),
            content: skill.content,
          }),
        )
      for (const skill of hubSkills) {
        if (RESERVED.has(skill.name)) continue
        editor.add(
          Skill.Info.make({
            id: Skill.ID.make(`hub.${skill.name}`),
            name: Skill.Name.make(skill.name),
            description: skill.description,
            autoinvoke: true,
            path: Skill.Info.fields.path.make(skill.file),
            content: skill.content,
          }),
        )
      }
      const removed: string[] = []
      for (const skill of editor.list()) {
        const official = within(BUNDLED, skill.path)
        const hub = within(HUB, skill.path)
        if (official || (hub && !RESERVED.has(skill.name))) continue
        removed.push(`${skill.id}@${skill.path ?? "(no path)"}`)
        editor.remove(skill.id)
      }
      log("skill.transform", { kept: editor.list().map((skill) => skill.id), removed })
    })

    const rpc = await ctx.rpc.register(runner, {
      start: async (input) => {
        grants.set(input.sessionID, { profile: "loginom-automation", origin: "run", at: Date.now() })
        log("grant.minted", { sessionID: input.sessionID, origin: "run" })
        await rpc.events.emit("stage", { sessionID: input.sessionID, stage: "running" })
        await ctx.session.prompt({ sessionID: input.sessionID, text: input.text } as never)
        return { granted: true }
      },
      // Hub state lives in plugin storage: measure one large value and many small keys.
      kvProbe: async (input) => {
        const bytes = (input as { bytes?: number }).bytes ?? 0
        const keys = (input as { keys?: number }).keys ?? 0
        const value = "x".repeat(bytes)
        const writeStart = performance.now()
        await ctx.storage.set("probe/large", value)
        const writeMs = performance.now() - writeStart
        const readStart = performance.now()
        const read = (await ctx.storage.get("probe/large")) as string | undefined
        const readMs = performance.now() - readStart
        const manyStart = performance.now()
        for (let index = 0; index < keys; index++) await ctx.storage.set(`probe/many/${index}`, { index })
        const manyWriteMs = performance.now() - manyStart
        const scanStart = performance.now()
        const scanned = await ctx.storage.scan({ prefix: "probe/many/" } as never)
        const scanMs = performance.now() - scanStart
        return { bytes, roundTrip: read?.length === bytes, writeMs, readMs, keys, manyWriteMs, scanMs, scanned: JSON.stringify(scanned).length }
      },
      hubReload: async () => {
        await ctx.skill.reload()
        return { reloaded: true }
      },
    })

    // Grant and lease live for one execution: any end of execution releases both.
    void (async () => {
      const types = [
        "session.execution.started",
        "session.execution.succeeded",
        "session.execution.failed",
        "session.execution.interrupted",
      ] as const
      for await (const event of ctx.event.subscribe({ types: [...types] })) {
        const sessionID = (event as { data?: { sessionID?: string } }).data?.sessionID ?? ""
        log("event", { type: event.type, sessionID })
        if (event.type === "session.execution.started") continue
        if (grants.delete(sessionID)) log("grant.ended", { sessionID, reason: event.type })
        if (heartbeats.has(sessionID)) releaseLease(sessionID, event.type)
      }
    })().catch((error) => log("event.error", { error: String(error) }))

    // Plugin disposal (reload or graceful shutdown) releases every lease this process still holds.
    return () => {
      for (const sessionID of [...heartbeats.keys()]) releaseLease(sessionID, "plugin.dispose")
      log("dispose")
    }
  },
})
