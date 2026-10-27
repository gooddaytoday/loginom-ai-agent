import { createHash, randomUUID } from "node:crypto"
import type { createLoginomHost } from "./host"
import type { InputFile } from "./inputs"
import type { FileReference } from "./file-reference"
import { hostException, hostFailure } from "./errors"
import { runtimeCallTimeout } from "../../loginom-runtime/src/call-timeout.mjs"
import { HostTaskScope } from "./task-scope"
import { Schema } from "effect"
import { prepareTool } from "../../loginom-runtime/client/lib/skill.mjs"
import { browserRecoveryToolName, isBrowserRecoveryTool } from "../../loginom-runtime/client/lib/browser-recovery.mjs"

const knowledgeTools = new Set(["find", "search", "read", "grep", "glob", "list", "tree"])
const Admissions = Schema.Array(
  Schema.Struct({
    userMessage: HostTaskScope.Info.fields.taskMessageID,
    files: Schema.Array(Schema.Struct({ name: Schema.String, data: Schema.String })),
  }),
)
const PackageInput = Schema.Struct({
  admissionID: Schema.NonEmptyString,
  file: Schema.Struct({ name: Schema.String, data: Schema.String }),
})
const PackageAdmission = Schema.Tuple([
  Schema.Struct({ artifact_id: Schema.NonEmptyString, upload: Schema.Struct({ grant_id: Schema.NonEmptyString }) }),
])
const diagnosticTool = {
  name: "dock_diagnostics",
  description:
    "Inspect local Loginom connection and Help readiness without opening a browser or querying the Skills API.",
  inputSchema: {
    type: "object",
    properties: { checkConnections: { type: "boolean", default: true } },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
}

function catalogTools(input: unknown) {
  if (
    !input ||
    typeof input !== "object" ||
    !("tools" in input) ||
    !Array.isArray(input.tools) ||
    !input.tools.every(
      (tool): tool is { name: string; inputSchema: { type: "object"; [key: string]: unknown } } =>
        tool &&
        typeof tool === "object" &&
        typeof tool.name === "string" &&
        tool.inputSchema &&
        typeof tool.inputSchema === "object" &&
        tool.inputSchema.type === "object",
    )
  )
    throw Error("LOGINOM_REPLY_INVALID")
  return input.tools
}

export type HostPort = {
  postMessage(value: unknown): void
  on(event: "message", listener: (event: { data: unknown }) => void): void
  on(event: "close", listener: () => void): void
  start(): void
}

export function loginomHostPort(port: HostPort, service: Awaited<ReturnType<typeof createLoginomHost>>) {
  const owner = randomUUID()
  const runs = new Map<
    string,
    {
      chat: string
      lease?: NonNullable<ReturnType<typeof service.acquire>>
      calls: number
      dispatching: boolean
      released: boolean
      active: Set<string>
      scope?: HostTaskScope.Info
      pendingScope?: HostTaskScope.Info
      scopes: Promise<void>
      browserDispatching: boolean
      applyingScope: boolean
      catalog: Set<string>
      admitted: Set<string>
      packagePreparation?: AbortController
      // Operation of a browser recovery attempt that still holds the page.
      recovery?: string
    }
  >()
  const acquiring = new Map<string, string>()
  const state = { closed: false, stopping: undefined as Promise<void> | undefined }
  const pending = new Set<Promise<void>>()
  async function abandon(run: NonNullable<ReturnType<typeof runs.get>>) {
    for (const id of run.active) await service.journal.settle(id, false)
    const retained = [...run.active].filter((id) => service.journal.pending().includes(id))
    run.active.clear()
    if (!retained.length || !run.lease) return
    run.lease.holdRecovery()
    service.recoveries.set(run.chat, run.lease)
  }
  async function release(id: string, run: NonNullable<ReturnType<typeof runs.get>>) {
    // A run that ends or is cancelled mid-recovery stops its attempt instead of
    // leaving the page leased until the budget expires (design §6).
    const generation = run.lease?.generation
    if (run.recovery && generation !== undefined && service.hasRuntime(generation, run.chat))
      await service
        .runtime(generation, run.chat)
        .then((runtime) =>
          runtime.request(
            "call",
            {
              name: browserRecoveryToolName,
              arguments: {
                action: "stop",
                operation_id: run.recovery,
                reason: "The agent run ended during browser recovery.",
              },
            },
            runtimeCallTimeout(browserRecoveryToolName, undefined) + 15_000,
          ),
        )
        .catch(() => undefined)
    run.recovery = undefined
    await abandon(run)
    run.lease?.release()
    runs.delete(id)
  }
  function reply(value: { id: string; result?: unknown; error?: string }, generation?: number) {
    if (state.closed) return
    port.postMessage(generation === undefined ? value : { ...value, generation })
  }
  async function connectionLease(id: string, run: NonNullable<ReturnType<typeof runs.get>>) {
    if (state.closed) throw new Error("LOGINOM_HOST_CLOSED")
    if (run.lease) return run.lease
    const status = await service.api.status()
    if (run.lease) return run.lease
    if (!status.hasApiKey) throw new Error("LOGINOM_CONFIG_REQUIRED")
    const lease = service.acquire(`${owner}:${id}`)
    if (!lease) throw new Error("LOGINOM_CONNECTION_NOT_READY")
    run.lease = lease
    return lease
  }
  async function handle(data: unknown) {
    if (state.closed) return
    if (
      !data ||
      typeof data !== "object" ||
      !("id" in data) ||
      typeof data.id !== "string" ||
      !("method" in data) ||
      typeof data.method !== "string"
    )
      return
    const input = "input" in data ? data.input : undefined
    if (!input || typeof input !== "object" || !("run" in input) || typeof input.run !== "string") {
      reply({ id: data.id, error: "LOGINOM_HOST_REQUEST_FAILED" })
      return
    }
    try {
      const hasPackageInput = "packageInput" in input && input.packageInput !== undefined
      if (hasPackageInput && (data.method !== "call" || !("name" in input) || input.name !== prepareTool.name))
        throw new Error("LOGINOM_SCOPE_DENIED")
      const packageInput = hasPackageInput ? Schema.decodeUnknownSync(PackageInput)(input.packageInput) : undefined
      if (packageInput) {
        const args = "args" in input ? input.args : undefined
        if (
          !args ||
          typeof args !== "object" ||
          !("intent" in args) ||
          args.intent !== "open_package" ||
          "package_path" in args ||
          "local_package_path" in args ||
          "workflow_ref" in args ||
          !packageInput.file.name.toLowerCase().endsWith(".lgp")
        )
          throw new Error("LOGINOM_SCOPE_DENIED")
      }
      if (data.method === "acquire") {
        if (
          !("session" in input) ||
          typeof input.session !== "string" ||
          !input.session ||
          runs.has(input.run) ||
          acquiring.has(input.run)
        )
          throw new Error("LOGINOM_RUN_INVALID")
        const chat = createHash("sha256").update(input.session).digest("hex")
        if (service.recoveries.has(chat) || service.journal.pending().length)
          throw new Error("LOGINOM_RECOVERY_REQUIRED")
        if ([...runs.values()].some((run) => run.chat === chat) || [...acquiring.values()].includes(chat))
          throw new Error("LOGINOM_CALL_BUSY")
        // Reserve the local identity before yielding; no connection lease is needed.
        acquiring.set(input.run, chat)
        try {
          const status = await service.api.status()
          await service.retireRuntime(chat)
          service.resetRestarts(chat)
          if (state.closed) throw new Error("LOGINOM_HOST_CLOSED")
          runs.set(input.run, {
            chat,
            calls: 0,
            dispatching: false,
            released: false,
            active: new Set(),
            scopes: Promise.resolve(),
            browserDispatching: false,
            applyingScope: false,
            catalog: new Set([prepareTool.name]),
            admitted: new Set(),
          })
          reply({ id: data.id, result: { generation: status.generation } })
        } finally {
          acquiring.delete(input.run)
        }
        return
      }
      const run = runs.get(input.run)
      if (!run || run.released) throw new Error("LOGINOM_RUN_INVALID")
      if (data.method === "release") {
        run.released = true
        if (!run.calls) {
          await release(input.run, run)
        }
        reply({ id: data.id, result: true })
        return
      }
      if (data.method === "scope") {
        const previous = run.scopes
        const next = Promise.withResolvers<void>()
        run.scopes = next.promise
        await previous
        run.calls++
        try {
          if (state.closed || run.released) throw new Error("LOGINOM_SCOPE_DENIED")
          const request = Schema.decodeUnknownSync(HostTaskScope.Request)(input)
          const idle = async () => {
            if (run.browserDispatching || service.journal.pending().length || service.recoveries.has(run.chat))
              throw new Error("LOGINOM_SCOPE_DENIED")
            const generation = run.lease?.generation ?? (await service.api.status()).generation
            const work = await service.workState(generation, run.chat).catch(() => undefined)
            if (!work || work.activeWork || work.unsettledWork || work.dispatching || run.browserDispatching)
              throw new Error("LOGINOM_SCOPE_DENIED")
          }
          if (request.mode === "bind") {
            if (
              run.calls > 1 ||
              run.browserDispatching ||
              (run.scope &&
                (run.scope.taskMessageID === request.scope.taskMessageID
                  ? run.scope.profile !== request.scope.profile
                  : request.scope.profile !== "default"))
            )
              throw new Error("LOGINOM_SCOPE_DENIED")
            run.scope = request.scope
            run.pendingScope = undefined
          }
          if (request.mode === "request") {
            if (
              !run.scope ||
              run.scope.taskMessageID !== request.scope.taskMessageID ||
              request.scope.profile === "default" ||
              !HostTaskScope.permits(run.pendingScope?.profile ?? run.scope.profile, request.scope.profile)
            )
              throw new Error("LOGINOM_SCOPE_DENIED")
            if (request.scope.profile === "package-docs") await idle()
            run.pendingScope = request.scope
          }
          if (request.mode === "apply") {
            run.applyingScope = true
            const pending = run.pendingScope
            run.pendingScope = undefined
            if (
              !run.scope ||
              !pending ||
              pending.taskMessageID !== request.scope.taskMessageID ||
              pending.profile !== request.scope.profile ||
              run.calls > 1 ||
              run.browserDispatching
            )
              throw new Error("LOGINOM_SCOPE_DENIED")
            if (pending.profile === "package-docs") await idle()
            run.scope = pending
          }
          reply({ id: data.id, result: request.scope }, run.lease?.generation)
        } catch {
          throw new Error("LOGINOM_SCOPE_DENIED")
        } finally {
          run.applyingScope = false
          next.resolve()
          run.calls--
          if (run.released && !run.calls) await release(input.run, run)
        }
        return
      }
      const browserCall =
        data.method === "call" &&
        "name" in input &&
        typeof input.name === "string" &&
        !knowledgeTools.has(input.name) &&
        input.name !== diagnosticTool.name
      const referenceCall = ["referenceReserve", "referenceAdmit", "referenceDiscard"].includes(data.method)
      if (
        (data.method === "admit" || referenceCall || browserCall) &&
        (run.applyingScope ||
          run.scope?.profile !== "loginom-automation" ||
          ((data.method === "admit" || referenceCall) && !service.hasRuntime(run.lease?.generation ?? -1, run.chat)) ||
          (browserCall &&
            "name" in input &&
            typeof input.name === "string" &&
            (!run.catalog.has(input.name) || (isBrowserRecoveryTool(input.name) && !service.browserRecovery))))
      )
        throw new Error("LOGINOM_SCOPE_DENIED")
      if (data.method !== "interrupt" && service.journal.pending().length) throw new Error("LOGINOM_RECOVERY_REQUIRED")
      // Refuse competing calls before durable admission. The active call keeps its
      // own journal and lease; a known no-dispatch refusal is not uncertainty.
      if ((data.method === "call" || referenceCall) && run.dispatching) throw new Error("LOGINOM_CALL_BUSY")
      if (data.method === "call" || referenceCall) run.dispatching = true
      if (packageInput) run.packagePreparation = new AbortController()
      const packageAborted = () =>
        packageInput && (state.closed || run.released || run.packagePreparation?.signal.aborted)
      if (browserCall || referenceCall) run.browserDispatching = true
      run.calls++
      try {
        if (data.method === "tools") {
          const status = await service.api.status()
          const automation = run.scope?.profile === "loginom-automation"
          const generation = run.lease?.generation ?? status.generation
          const knowledge =
            run.lease || status.state === "ready"
              ? catalogTools(await service.catalog(generation).catch(() => ({ tools: [] }))).filter((tool) =>
                  knowledgeTools.has(tool.name),
                )
              : []
          // Listing an existing browser is an external operation; an empty local
          // catalog must remain usable when that connection cannot be leased.
          if (automation && !run.lease && service.hasRuntime(generation, run.chat))
            await connectionLease(input.run, run).catch(() => undefined)
          const listed =
            automation && run.lease && service.hasRuntime(run.lease.generation, run.chat)
              ? await (await service.runtime(run.lease.generation, run.chat)).request("list")
              : undefined
          // The runtime lists recovery tools only under its own capability; the host
          // independently withholds them unless this launch carries it too.
          const browser =
            listed && typeof listed === "object" && "prepared" in listed && listed.prepared === true
              ? catalogTools(listed).filter((tool) => service.browserRecovery || !isBrowserRecoveryTool(tool.name))
              : []
          run.catalog = new Set([prepareTool.name, ...browser.map((tool) => tool.name)])
          reply(
            {
              id: data.id,
              result: {
                tools: [
                  ...knowledge,
                  ...(automation ? [prepareTool] : []),
                  diagnosticTool,
                  ...browser.filter(
                    (tool) =>
                      !knowledgeTools.has(tool.name) && ![prepareTool.name, diagnosticTool.name].includes(tool.name),
                  ),
                ],
              },
            },
            run.lease?.generation ?? status.generation,
          )
          return
        }
        if (data.method === "admit") {
          if (
            !("userMessage" in input) ||
            typeof input.userMessage !== "string" ||
            !("files" in input) ||
            !Array.isArray(input.files) ||
            !input.files.every(
              (file): file is InputFile =>
                !!file && typeof file === "object" && typeof file.name === "string" && typeof file.data === "string",
            )
          )
            throw new Error("LOGINOM_INPUT_INVALID")
          if (input.files.some((file) => file.name.toLowerCase().endsWith(".lgp")))
            throw new Error("LOGINOM_SCOPE_DENIED")
          const lease = await connectionLease(input.run, run)
          const runtime = await service.runtime(lease.generation, run.chat)
          const files = await service.inputs(lease.generation, run.chat, input.userMessage, input.files)
          if (run.admitted.has(input.userMessage)) {
            reply({ id: data.id, result: [] }, lease.generation)
            return
          }
          if (state.closed) throw new Error("LOGINOM_HOST_CLOSED")
          const result = await runtime.request("admit", { files, userMessage: input.userMessage })
          run.admitted.add(input.userMessage)
          reply(
            {
              id: data.id,
              result,
            },
            lease.generation,
          )
          return
        }
        if (referenceCall) {
          const lease = await connectionLease(input.run, run)
          const owner = {
            run: input.run,
            chat: run.chat,
            userMessage: run.scope!.taskMessageID,
            generation: lease.generation,
          }
          if (data.method === "referenceDiscard") {
            if (!("grant" in input) || typeof input.grant !== "string") throw Error("LOGINOM_INPUT_INVALID")
            await service.references.discard(owner, input.grant)
            reply({ id: data.id, result: { discarded: true } }, lease.generation)
            return
          }
          if (data.method === "referenceReserve") {
            if (
              !("userMessage" in input) ||
              input.userMessage !== owner.userMessage ||
              !("name" in input) ||
              typeof input.name !== "string"
            )
              throw Error("LOGINOM_INPUT_INVALID")
            const result = await service.references.reserve(owner, input.name)
            reply({ id: data.id, result }, lease.generation)
            return
          }
          if (!("reference" in input) || !input.reference || typeof input.reference !== "object")
            throw Error("LOGINOM_INPUT_INVALID")
          const reference = await service.references.commit(owner, input.reference as FileReference)
          if (state.closed || run.released) throw Error("LOGINOM_HOST_CLOSED")
          const runtime = await service.runtime(lease.generation, run.chat)
          const result = await runtime.request("admitReference", { reference })
          reply({ id: data.id, result }, lease.generation)
          return
        }
        if (data.method === "interrupt") {
          run.packagePreparation?.abort()
          if (!run.lease) {
            const status = await service.api.status()
            if (service.hasRuntime(status.generation, run.chat)) await connectionLease(input.run, run)
          }
          if (!run.lease) {
            reply({ id: data.id, result: true })
            return
          }
          await service.knowledge(run.lease.generation).request("interrupt", { run: `${owner}:${input.run}` })
          if (!service.hasRuntime(run.lease.generation, run.chat)) {
            reply({ id: data.id, result: true })
            return
          }
          const runtime = await service.runtime(run.lease.generation, run.chat)
          await runtime.request("interrupt")
          reply({ id: data.id, result: true })
          return
        }
        if (
          data.method !== "call" ||
          !("name" in input) ||
          typeof input.name !== "string" ||
          !("userMessage" in input) ||
          typeof input.userMessage !== "string"
        )
          throw new Error("LOGINOM_CALL_INVALID")
        if (knowledgeTools.has(input.name)) {
          const lease = await connectionLease(input.run, run)
          const result = await service.knowledge(lease.generation).request("call", {
            run: `${owner}:${input.run}`,
            id: data.id,
            name: input.name,
            arguments: "args" in input ? input.args : undefined,
          })
          reply({ id: data.id, result }, lease.generation)
          return
        }
        if (input.name === "dock_diagnostics") {
          const status = await service.api.status()
          reply(
            {
              id: data.id,
              result: { content: [{ type: "text", text: JSON.stringify(status) }], structuredContent: status },
            },
            run.lease?.generation ?? status.generation,
          )
          return
        }
        const admissions = Schema.decodeUnknownSync(Admissions)(
          "admissions" in input && input.admissions !== undefined ? input.admissions : [],
        )
        if (admissions.some((admission) => admission.files.some((file) => file.name.toLowerCase().endsWith(".lgp"))))
          throw new Error("LOGINOM_SCOPE_DENIED")
        const lease = await connectionLease(input.run, run)
        if (input.name !== prepareTool.name && !service.hasRuntime(lease.generation, run.chat))
          throw new Error("LOGINOM_SCOPE_DENIED")
        const recovery = { id: undefined as string | undefined }
        try {
          const packageAdmission = packageInput
            ? {
                userMessage: packageInput.admissionID,
                files: await service.inputs(lease.generation, run.chat, packageInput.admissionID, [packageInput.file]),
              }
            : undefined
          if (packageAborted()) throw new Error("LOGINOM_RUN_ABORTED")
          // A dead runtime is replaced before admission. Past the relaunch limit this
          // is a known refusal, not an uncertain dispatch.
          if (!service.hasRuntime(lease.generation, run.chat)) {
            run.admitted.clear()
            run.catalog = new Set([prepareTool.name])
          }
          const runtime = await service.runtime(lease.generation, run.chat)
          if (packageAborted()) throw new Error("LOGINOM_RUN_ABORTED")
          const packageArtifact = packageAdmission
            ? await runtime.request("admit", packageAdmission).then((value) => {
                const [artifact] = Schema.decodeUnknownSync(PackageAdmission)(value)
                return { artifactID: artifact.artifact_id, uploadGrantID: artifact.upload.grant_id }
              })
            : undefined
          if (packageAborted()) throw new Error("LOGINOM_RUN_ABORTED")
          for (const admission of admissions) {
            const files = await service.inputs(lease.generation, run.chat, admission.userMessage, [...admission.files])
            if (run.admitted.has(admission.userMessage)) continue
            await runtime.request("admit", { files, userMessage: admission.userMessage })
            run.admitted.add(admission.userMessage)
          }
          if (packageAborted()) throw new Error("LOGINOM_RUN_ABORTED")
          recovery.id = await service.journal.begin(run.chat, lease.generation)
          run.active.add(recovery.id)
          if (!service.hasRuntime(lease.generation, run.chat) || packageAborted()) {
            // Exit during journal admission precedes dispatch. Settle this unused
            // record, and require explicit preparation before a replacement owner.
            await service.journal.settle(recovery.id, true)
            run.active.delete(recovery.id)
            recovery.id = undefined
            throw new Error(packageAborted() ? "LOGINOM_RUN_ABORTED" : "LOGINOM_SCOPE_DENIED")
          }
          if (state.closed) throw new Error("LOGINOM_HOST_CLOSED")
          const result = await runtime.request(
            "call",
            {
              name: input.name,
              arguments: "args" in input ? input.args : undefined,
              ...(packageArtifact ? { packageArtifact } : {}),
            },
            runtimeCallTimeout(input.name, "args" in input ? input.args : undefined) + 15_000,
          )
          if (
            !result ||
            typeof result !== "object" ||
            !("recoveryPending" in result) ||
            typeof result.recoveryPending !== "boolean" ||
            !("result" in result)
          )
            throw new Error("LOGINOM_REPLY_INVALID")
          if (result.recoveryPending && !("activeWork" in result && result.activeWork === true)) {
            await abandon(run)
            service.markRuntimeStale(run.chat)
          }
          if (result.recoveryPending === false) {
            // Only this owner and runtime can prove completion of its prior async work.
            // Keep records durable across wait timeouts; a restart recovers them.
            for (const id of run.active) await service.journal.settle(id, true)
            run.active.clear()
            if (!service.journal.pending().length) {
              lease.reconciled()
              service.recoveries.delete(run.chat)
            }
          }
          if (isBrowserRecoveryTool(input.name)) run.recovery = recoveryPhase(result.result, run.recovery)
          reply({ id: data.id, result: result.result }, lease.generation)
        } catch (error) {
          if (error instanceof Error && error.message === "LOGINOM_RUNTIME_UNAVAILABLE") throw error
          // A journal write failure precedes runtime dispatch and cannot establish
          // an uncertain external operation without an admitted journal identity.
          if (!recovery.id) throw hostException(error)
          await abandon(run)
          service.markRuntimeStale(run.chat)
          throw new Error("LOGINOM_CALL_UNCERTAIN")
        }
      } finally {
        if (data.method === "call" || referenceCall) {
          run.dispatching = false
          run.packagePreparation = undefined
        }
        if (browserCall || referenceCall) run.browserDispatching = false
        run.calls--
        if (run.released && !run.calls) {
          await release(input.run, run)
        }
      }
    } catch (error) {
      reply({ id: data.id, ...hostFailure(error) }, runs.get(input.run)?.lease?.generation)
    }
  }
  port.on("message", ({ data }) => {
    const work = handle(data)
    pending.add(work)
    void work
      .finally(() => pending.delete(work))
      .catch(() => {
        void stop().catch(() => undefined)
      })
  })
  function stop() {
    if (state.stopping) return state.stopping
    state.closed = true
    runs.forEach((run) => {
      run.released = true
    })
    // In-flight operations retain their leases until their finally handlers run.
    state.stopping = Promise.all([...pending]).then(async () => {
      for (const [id, run] of runs) await release(id, run)
    })
    return state.stopping
  }
  port.on("close", () => {
    void stop().catch(() => undefined)
  })
  port.start()
  return {
    async close() {
      await stop()
    },
  }
}

// Recovery replies report the lease phase; an ordinary browser action reply has none.
function recoveryPhase(result: unknown, current: string | undefined) {
  if (!result || typeof result !== "object" || !("structuredContent" in result)) return current
  const value = result.structuredContent
  if (!value || typeof value !== "object" || !("phase" in value) || typeof value.phase !== "string") return current
  if (!["handoff", "browser", "verify"].includes(value.phase)) return undefined
  return "operation_id" in value && typeof value.operation_id === "string" ? value.operation_id : current
}
