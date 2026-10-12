import { createHash, randomUUID } from "node:crypto"
import type { createLoginomHost } from "./host"
import type { InputFile } from "./inputs"
import { hostError } from "./errors"
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
      lease: NonNullable<ReturnType<typeof service.acquire>>
      calls: number
      dispatching: boolean
      released: boolean
      active: Set<string>
      captured: boolean
      captureRefused: boolean
      readonlyRuntime?: Awaited<ReturnType<typeof service.runtime>>
    }
  >()
  const state = { closed: false, stopping: undefined as Promise<void> | undefined }
  const pending = new Set<Promise<void>>()
  function readonlyCall(input: Record<string, unknown>) {
    const args=input.args;
    if (input.name==='dock_diagnostics') return !!args && typeof args==='object'
      && Object.keys(args).length===1 && 'checkConnections' in args && args.checkConnections===false;
    if (input.name!=='dock_workspace_observe' || (args!==undefined && (!args || typeof args!=='object' || Array.isArray(args)))) return false;
    const value=(args??{}) as Record<string,unknown>;
    return Object.entries(value).every(([key,v]) => key==='scope'
      ? ['bootstrap','all','palette','graph','dialogs','roots','wizard'].includes(v as string)
      : ['cursor','root_ref','observation_id','storage_name'].includes(key) && typeof v==='string' && v.length>0 && v.length<=(key==='storage_name'?200:128));
  }
  async function abandon(run: NonNullable<ReturnType<typeof runs.get>>) {
    for (const id of run.active) await service.journal.settle(id, false)
    const retained = [...run.active].filter((id) => service.journal.pending().includes(id))
    run.active.clear()
    if (!retained.length) return
    run.lease.holdRecovery()
    service.recoveries.set(run.chat, run.lease)
  }
  async function release(id: string, run: NonNullable<ReturnType<typeof runs.get>>) {
    await abandon(run)
    run.lease.release()
    runs.delete(id)
  }
  function reply(value: unknown) {
    if (state.closed) return
    port.postMessage(value)
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
      if (data.method === "acquire") {
        if (!("session" in input) || typeof input.session !== "string" || !input.session || runs.has(input.run))
          throw new Error("LOGINOM_RUN_INVALID")
        const chat = createHash("sha256").update(input.session).digest("hex")
        if (service.recoveries.has(chat)) throw new Error("LOGINOM_RECOVERY_REQUIRED")
        if ([...runs.values()].some((run) => run.chat === chat)) throw new Error("LOGINOM_CALL_BUSY")
        const lease = service.acquire(`${owner}:${input.run}`)
        if (!lease) {
          reply({ id: data.id, result: null })
          return
        }
        await service.retireRuntime(chat)
        service.resetRestarts(chat)
        try { service.bindCapture?.(owner, input.run, chat, lease) } catch (error) { lease.release(); throw error }
        runs.set(input.run, { chat, lease, calls: 0, dispatching: false, released: false, active: new Set(), captured: false, captureRefused: false })
        reply({ id: data.id, result: { generation: lease.generation } })
        return
      }
      const run = runs.get(input.run)
      if (!run || run.released) throw new Error("LOGINOM_RUN_INVALID")
      if (run.readonlyRuntime) {
        if (data.method!=='call' || !readonlyCall(input) || run.calls || run.dispatching
            || service.journal.pending().length) throw Error("LOGINOM_RECOVERY_REQUIRED")
        run.calls++
        try {
          const request=input as Record<string,unknown>
          const observed=await run.readonlyRuntime.request("call",{name:request.name,arguments:request.args})
          if (!observed || typeof observed!=='object' || !("result" in observed)
              || !("readonlyContinuation" in observed) || observed.readonlyContinuation!==true || service.journal.pending().length)
            throw Error("LOGINOM_RECOVERY_REQUIRED")
          reply({id:data.id,result:observed.result})
        } finally {run.calls--}
        return
      }
      if (run.captureRefused) {
        if (data.method !== "call" || !("name" in input) || typeof input.name !== "string"
            || !["dock_diagnostics", "dock_workspace_observe", "dock_operation_inspect", "dock_node_status"].includes(input.name)
            || run.calls || run.dispatching) throw Error("LOGINOM_RECOVERY_REQUIRED")
        // Same retained runtime, read-only diagnosis. Never reconcile the capture
        // journal or mint another mutation admission from this observation.
        run.calls++
        try {
          const runtime = await service.runtime(run.lease.generation, run.chat)
          const observed = await runtime.request("call", {name:input.name,arguments:"args" in input ? input.args : undefined})
          if (!observed || typeof observed !== "object" || !("result" in observed)) throw Error("LOGINOM_REPLY_INVALID")
          reply({id:data.id,result:observed.result})
        } finally { run.calls-- }
        return
      }
      if (data.method === "acceptance.capture") {
        if (Object.keys(input).sort().join(",") !== "authorization,run"
            || !("authorization" in input) || !service.authorizeCapture?.(input.authorization, owner, input.run, run.chat, run.lease) || run.captured)
          throw Error("LOGINOM_METHOD_INVALID")
        if (run.dispatching || run.calls || run.active.size || service.journal.pending().length)
          throw Error("LOGINOM_CALL_BUSY")
        run.captured = true
        run.dispatching = true
        run.calls++
        let id: string | undefined
        try {
          const runtime = await service.runtime(run.lease.generation, run.chat)
          id = await service.journal.begin(run.chat, run.lease.generation)
          run.active.add(id)
          const result = await runtime.request("acceptance.capture")
          if (!result || typeof result !== "object" || !("cleanupComplete" in result) || result.cleanupComplete !== true) {
            run.captureRefused = true
            run.lease.holdRecovery()
            service.recoveries.set(run.chat, run.lease)
            await service.journal.settle(id, false)
            reply({id:data.id,result})
            return
          }
          await runtime.close()
          await service.journal.settle(id, true)
          run.active.delete(id)
          reply({ id: data.id, result })
        } catch (error) {
          run.captureRefused = true
          run.lease.holdRecovery()
          service.recoveries.set(run.chat, run.lease)
          if (id) await service.journal.settle(id, false)
          throw error
        } finally { run.calls--; run.dispatching = false }
        return
      }
      if (run.captured && run.calls) throw Error("LOGINOM_CALL_BUSY")
      if (run.captured && ["call", "admit"].includes(data.method)) throw Error("LOGINOM_RECOVERY_REQUIRED")
      if (data.method === "release") {
        run.released = true
        if (!run.calls) {
          await release(input.run, run)
        }
        reply({ id: data.id, result: true })
        return
      }
      if (data.method !== "interrupt" && service.journal.pending().length) throw new Error("LOGINOM_RECOVERY_REQUIRED")
      // Refuse competing calls before durable admission. The active call keeps its
      // own journal and lease; a known no-dispatch refusal is not uncertainty.
      if (data.method === "call" && run.dispatching) throw new Error("LOGINOM_CALL_BUSY")
      if (data.method === "call") run.dispatching = true
      run.calls++
      try {
        if (data.method === "tools") {
          const runtime = await service.runtime(run.lease.generation, "readiness")
          reply({ id: data.id, result: await runtime.request("list") })
          return
        }
        if (data.method === "admit") {
          const runtime = await service.runtime(run.lease.generation, run.chat)
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
          const files = await service.inputs(run.lease.generation, run.chat, input.userMessage, input.files)
          if (state.closed) throw new Error("LOGINOM_HOST_CLOSED")
          reply({
            id: data.id,
            result: await runtime.request("admit", { files, userMessage: input.userMessage }),
          })
          return
        }
        if (data.method === "interrupt") {
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
        const recovery = { id: undefined as string | undefined }
        try {
          // A dead runtime is replaced before admission. Past the relaunch limit this
          // is a known refusal, not an uncertain dispatch.
          await service.runtime(run.lease.generation, run.chat)
          recovery.id = await service.journal.begin(run.chat, run.lease.generation)
          run.active.add(recovery.id)
          const runtime = await service.runtime(run.lease.generation, run.chat).catch(async (error: unknown) => {
            // Exit can land during journal.begin. A relaunch-limit refusal from
            // this lookup precedes dispatch, so settle only this unused admission.
            if (error instanceof Error && error.message === "LOGINOM_RUNTIME_UNAVAILABLE" && recovery.id) {
              await service.journal.settle(recovery.id, true)
              run.active.delete(recovery.id)
            }
            throw error
          })
          if (state.closed) throw new Error("LOGINOM_HOST_CLOSED")
          const result = await runtime.request("call", {
            name: input.name,
            arguments: "args" in input ? input.args : undefined,
          })
          if (
            !result ||
            typeof result !== "object" ||
            !("recoveryPending" in result) ||
            typeof result.recoveryPending !== "boolean" ||
            !("result" in result)
          )
            throw new Error("LOGINOM_REPLY_INVALID")
          if (result.recoveryPending && 'readonlyContinuation' in result && result.readonlyContinuation===true
              && readonlyCall(input) && 'activeWork' in result && result.activeWork===false) {
            // Keep this exact runtime/lease. Settle only this completed read;
            // no prior uncertainty or cleanup refusal is reconciled by it.
            await service.journal.settle(recovery.id!,true)
            run.active.delete(recovery.id!)
            run.readonlyRuntime=runtime
            run.lease.holdRecovery()
            service.recoveries.set(run.chat,run.lease)
          } else if (result.recoveryPending && !("activeWork" in result && result.activeWork === true)) {
            await abandon(run)
            service.markRuntimeStale(run.chat)
          }
          if (result.recoveryPending === false) {
            // Only this owner and runtime can prove completion of its prior async work.
            // Keep records durable across wait timeouts; a restart recovers them.
            for (const id of run.active) await service.journal.settle(id, true)
            run.active.clear()
            if (!service.journal.pending().length) {
              run.lease.reconciled()
              service.recoveries.delete(run.chat)
            }
          }
          reply({ id: data.id, result: result.result })
        } catch (error) {
          if (error instanceof Error && error.message === "LOGINOM_RUNTIME_UNAVAILABLE") throw error
          // A journal write failure precedes runtime dispatch and cannot establish
          // an uncertain external operation without an admitted journal identity.
          if (!recovery.id) throw new Error("LOGINOM_HOST_REQUEST_FAILED")
          await abandon(run)
          service.markRuntimeStale(run.chat)
          throw new Error("LOGINOM_CALL_UNCERTAIN")
        }
      } finally {
        if (data.method === "call") run.dispatching = false
        run.calls--
        if (run.released && !run.calls) {
          await release(input.run, run)
        }
      }
    } catch (error) {
      reply({ id: data.id, error: hostError(error) })
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
    // In-flight operations retain their leases until their finally handlers run.
    state.stopping = Promise.all([...pending]).then(async () => {
      if (service.journal.pending().length || [...runs.values()].some((run) => run.active.size || run.captureRefused || run.readonlyRuntime))
        throw new Error("LOGINOM_RECOVERY_REQUIRED")
      for (const [id, run] of runs) await release(id, run)
      state.closed = true
    })
    const attempt = state.stopping
    void attempt.catch(() => {
      if (state.stopping === attempt) state.stopping = undefined
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
