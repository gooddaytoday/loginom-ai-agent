import { createHash, randomUUID } from "node:crypto"
import type { createLoginomHost } from "./host"
import type { InputFile } from "./inputs"
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
    }
  >()
  const state = { closed: false, stopping: undefined as Promise<void> | undefined }
  const pending = new Set<Promise<void>>()
  async function abandon(run: NonNullable<ReturnType<typeof runs.get>>) {
    for (const id of run.active) await service.journal.settle(id, false)
    if (run.active.size) {
      run.lease.holdRecovery()
      service.recoveries.set(run.chat, run.lease)
      run.active.clear()
    }
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
        const recovery = service.recoveries.get(chat) || [...runs.values()].some((run) => run.chat === chat)
        const lease = recovery ? undefined : service.acquire(`${owner}:${input.run}`)
        if (!lease) {
          reply({ id: data.id, result: null })
          return
        }
        runs.set(input.run, { chat, lease, calls: 0, dispatching: false, released: false, active: new Set() })
        reply({ id: data.id, result: { generation: lease.generation } })
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
          recovery.id = await service.journal.begin(run.chat, run.lease.generation)
          run.active.add(recovery.id)
          const runtime = await service.runtime(run.lease.generation, run.chat)
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
        } catch {
          // A journal write failure precedes runtime dispatch and cannot establish
          // an uncertain external operation without an admitted journal identity.
          if (!recovery.id) throw new Error("LOGINOM_HOST_REQUEST_FAILED")
          await abandon(run)
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
      const code =
        error instanceof Error &&
        ["LOGINOM_RECOVERY_REQUIRED", "LOGINOM_CALL_UNCERTAIN", "LOGINOM_CALL_BUSY"].includes(error.message)
          ? error.message
          : "LOGINOM_HOST_REQUEST_FAILED"
      reply({ id: data.id, error: code })
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
