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
      draftRetained?: boolean
      preReadyHeld?: boolean
      amountHeld?:boolean
    }
  >()
  const state = { closed: false, stopping: undefined as Promise<void> | undefined }
  const pending = new Set<Promise<void>>()
  let amountClaimed=false
  const amountAcquires=new Map<string,{run:string;startup:NonNullable<ReturnType<typeof service.amountStartupControl>>}>()
  const reads = new Map<string, {run: NonNullable<ReturnType<typeof runs.get>>; controller: AbortController; authorization: string}>()
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
    let amountRequest=false
    try {
      if(data.method==="readonly.preReady.cancel" && "phase" in input && input.phase==="acquired") {
        const active="requestId" in input && typeof input.requestId==="string" ? amountAcquires.get(input.requestId):undefined;
        if(Object.keys(input).sort().join(",")!=="authorization,deadline,operation,phase,rejection,request,requestId,run" || !active || active.run!==input.run || !("authorization" in input) || input.authorization!==active.startup.tuple.authorization
            || !("operation" in input) || input.operation!==active.startup.tuple.operation || !("request" in input) || input.request!==active.startup.tuple.request
            || !("deadline" in input) || input.deadline!==active.startup.control.deadline || !("rejection" in input))throw Error("LOGINOM_METHOD_INVALID");
        active.startup.abortAcquired(decodeReadRejection(input.rejection));reply({id:data.id,result:false});return;
      }
      if (data.method === "acquire") {
        if (!("session" in input) || typeof input.session !== "string" || !input.session || runs.has(input.run))
          throw new Error("LOGINOM_RUN_INVALID")
        const chat = createHash("sha256").update(input.session).digest("hex")
        if (service.recoveries.has(chat)) throw new Error("LOGINOM_RECOVERY_REQUIRED")
        if ([...runs.values()].some((run) => run.chat === chat)) throw new Error("LOGINOM_CALL_BUSY")
        const amount=service.amountStartupControl?.();
        if(!amount){
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
        if(amount) {
          const c="amountControl" in input ? input.amountControl as Record<string,unknown> : undefined;
          if(!c || Object.keys(c).sort().join(',')!=="authorization,operation,request" || c.authorization!==amount.tuple.authorization
              || c.operation!==amount.tuple.operation || c.request!==amount.tuple.request || !("deadline" in data) || data.deadline!==amount.control.deadline)
            throw Error("LOGINOM_HANDSHAKE_INVALID");
          amount.guard();service.assertAmountAcquire(chat);if(amountClaimed)throw Error("LOGINOM_RECOVERY_REQUIRED");amountClaimed=true;amountRequest=true;amountAcquires.set(data.id,{run:input.run,startup:amount});
        }
        const lease = service.acquire(`${owner}:${input.run}`)
        if (!lease) {
          amountAcquires.delete(data.id);reply({ id: data.id, result: null });return
        }
        const acquired={chat,lease,calls:0,dispatching:false,released:false,active:new Set<string>(),captured:false,captureRefused:false,amountHeld:!!amount};
        if(amount)runs.set(input.run,acquired);
        try {
          if(!amount)await service.retireRuntime(chat);amount?.guard();
          service.resetRestarts(chat);service.bindCapture?.(owner,input.run,chat,lease);
          if(amount){await service.runtime(lease.generation,chat);amount.guard();service.assertCapture(owner,input.run,chat,lease)}
          runs.set(input.run,acquired);reply({id:data.id,result:{generation:lease.generation}});
        } catch(error) {
          if(amount){acquired.captureRefused=true;lease.holdRecovery();service.recoveries.set(chat,lease);throw error}
          lease.release();throw error;
        } finally {amountAcquires.delete(data.id)}
        return
      }
      const run = runs.get(input.run)
      if (!run || run.released) throw new Error("LOGINOM_RUN_INVALID")
      if (data.method === "readonly.preReady.cancel") {
        if (Object.keys(input).sort().join(",") !== "authorization,rejection,requestId,run"
            || !("authorization" in input) || !service.authorizeCapture(input.authorization)
            || !("requestId" in input) || typeof input.requestId !== "string") throw Error("LOGINOM_METHOD_INVALID")
        const reading = reads.get(input.requestId)
        if (!reading || reading.run !== run || reading.authorization !== input.authorization) throw Error("LOGINOM_METHOD_INVALID")
        reading.controller.abort(decodeReadRejection("rejection" in input ? input.rejection : undefined))
        reply({id:data.id,result:false}); return
      }
      if (data.method === "readonly.preReady") {
        if (Object.keys(input).sort().join(",") !== "authorization,run" || !("authorization" in input)
            || typeof input.authorization !== "string" || !service.authorizeCapture(input.authorization)
            || service.captureHarness(run.chat) !== "field-parameters-preservation-v1"
            || !("deadline" in data) || !Number.isSafeInteger(data.deadline)) throw Error("LOGINOM_METHOD_INVALID")
        const deadline = data.deadline as number
        if (run.preReadyHeld || run.captured || run.captureRefused || run.dispatching || run.calls || run.active.size
            || service.journal.pending().length) throw Error("LOGINOM_RECOVERY_REQUIRED")
        const grant = service.captureBinding(run.chat), lease = run.lease
        const tuple = grant && JSON.stringify(grant)
        const controller = new AbortController()
        const originalRun = run, runId = input.run
        function guard() {
          controller.signal.throwIfAborted()
          if (Date.now() >= deadline) throw Error("LOGINOM_PRE_READY_READ_EXPIRED")
          if (state.closed || runs.get(runId) !== originalRun || originalRun.released || originalRun.lease !== lease
              || !grant || service.captureBinding(originalRun.chat) !== grant || JSON.stringify(grant) !== tuple
              || grant.harness !== "field-parameters-preservation-v1" || grant.owner !== owner || grant.run !== runId
              || grant.generation !== lease.generation || grant.chat !== originalRun.chat || Date.now() >= grant.expires
              || deadline > grant.expires || service.journal.pending().length) throw Error("LOGINOM_RECOVERY_REQUIRED")
        }
        guard()
        run.preReadyHeld = true; run.calls++; run.dispatching = true
        reads.set(data.id, {run,controller,authorization:input.authorization})
        try {
          const lookup = service.runtime(lease.generation, run.chat)
          const retained = service.retainedRuntime(lease.generation, run.chat)
          const runtime = await lookup
          guard()
          if (!retained || service.retainedRuntime(lease.generation, run.chat) !== retained) throw Error("LOGINOM_RECOVERY_REQUIRED")
          const result = await runtime.readPreReady({signal:controller.signal,deadline})
          guard()
          if (service.retainedRuntime(lease.generation, run.chat) !== retained || !result || typeof result !== "object"
              || !("ready" in result) || result.ready !== false || !("cleanupComplete" in result) || result.cleanupComplete !== false
              || !("kind" in result) || result.kind !== "PRE_READY_CLOSED_READ") throw Error("LOGINOM_RECOVERY_REQUIRED")
          reply({id:data.id,result})
        } catch (error) {
          run.lease.holdRecovery(); service.recoveries.set(run.chat,run.lease)
          reply({id:data.id,rejection:encodeReadRejection(error)})
        } finally { reads.delete(data.id); run.calls--; run.dispatching = false }
        return
      }
      if (run.preReadyHeld) throw Error("LOGINOM_RECOVERY_REQUIRED")
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
        if(run.amountHeld)throw Error("LOGINOM_AMOUNT_CAPTURE_PROXY_UNAVAILABLE")
        if (Object.keys(input).sort().join(",") !== "authorization,run"
            || !("authorization" in input) || !service.authorizeCapture?.(input.authorization) || run.captured)
          throw Error("LOGINOM_METHOD_INVALID")
        if (run.dispatching || run.calls || run.active.size || service.journal.pending().length)
          throw Error("LOGINOM_CALL_BUSY")
        service.assertCapture?.(owner,input.run,run.chat,run.lease)
        run.captured = true
        run.dispatching = true
        run.calls++
        let id: string | undefined
        try {
          const runtime = await service.runtime(run.lease.generation, run.chat)
          service.assertCapture?.(owner,input.run,run.chat,run.lease)
          id = await service.journal.begin(run.chat, run.lease.generation)
          run.active.add(id)
          service.assertCapture?.(owner,input.run,run.chat,run.lease)
          const result = await runtime.request("acceptance.capture")
          service.assertCapture?.(owner,input.run,run.chat,run.lease)
          if(service.captureHarness?.(run.chat)==='field-parameters-preservation-v1'){
            const grant=service.captureBinding(run.chat),draft=result&&typeof result==='object'&&'draft' in result?result.draft as any:undefined;
            if(!result||typeof result!=='object'||!('draftRetained' in result)||result.draftRetained!==true
              ||!('cleanupComplete' in result)||result.cleanupComplete!==false||!('stoppedBeforeDone' in result)||result.stoppedBeforeDone!==true
              ||!grant||grant.owner!==owner||grant.run!==input.run||grant.generation!==run.lease.generation||grant.chat!==run.chat
              ||Date.now()>=grant.expires||draft?.kind!=='field_parameters_preservation_draft'||draft.stopped_before_done!==true
              ||draft.settings_applied!==false||draft.execution_started!==false
              ||!['owner','run','lease','generation','chat','account','packagePath','admission','expires'].every(k=>draft.owner?.[k]===(grant as any)[k]))throw Error('LOGINOM_REPLY_INVALID')
            run.draftRetained=true;run.captureRefused=true;run.lease.holdRecovery();service.recoveries.set(run.chat,run.lease);
            await service.journal.settle(id,false);reply({id:data.id,result});return;
          }
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
      if(run.amountHeld && ["admit","call","interrupt"].includes(data.method))throw Error("LOGINOM_RECOVERY_REQUIRED")
      if (run.captured && run.calls) throw Error("LOGINOM_CALL_BUSY")
      if (run.captured && ["call", "admit"].includes(data.method)) throw Error("LOGINOM_RECOVERY_REQUIRED")
      if (data.method === "release") {
        if(service.amountStartupControl?.() && (run.captureRefused||run.amountHeld))throw Error("LOGINOM_RECOVERY_REQUIRED")
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
      const amount=service.amountStartupControl?.();
      if(amount && amountRequest && data.method==="acquire")reply({id:data.id,rejection:encodeAmountRejection(amount.propagate(error)),rejectionOrigin:amount.rejectionOrigin,
        ...(amount.secondary?{secondaryRejection:encodeAmountRejection(amount.secondary.value)}:{})});
      else reply({ id: data.id, error: hostError(error) })
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
      if (service.journal.pending().length || [...runs.values()].some((run) => run.active.size || run.captureRefused || run.preReadyHeld || run.amountHeld))
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

function encodeReadRejection(value: unknown): unknown {
  if(value instanceof Error)return {kind:"Error",name:value.name,message:value.message,...("cause" in value?{cause:encodeReadRejection(value.cause)}:{})}
  return {kind:"value",value:value===undefined?null:value,is_undefined:value===undefined}
}
function decodeReadRejection(value: any): unknown {
  if(value?.kind==="Error"){const error=new Error(value.message,"cause" in value?{cause:decodeReadRejection(value.cause)}:undefined);error.name=value.name;return error}
  return value?.is_undefined?undefined:value?.value
}

function encodeAmountRejection(value:unknown):unknown {
 if(value instanceof Error)return{kind:"Error",name:value.name,message:value.message,...("cause" in value?{cause:encodeAmountRejection(value.cause)}:{})};
 return{kind:"value",value:value===undefined?null:value,is_undefined:value===undefined};
}
