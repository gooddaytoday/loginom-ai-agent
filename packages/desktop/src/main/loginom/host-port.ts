import { createHash, randomUUID } from "node:crypto"
import type { MessagePortMain } from "electron"
import type { desktopLoginom } from "./desktop-service"

export function loginomHostPort(port: MessagePortMain, service: Awaited<ReturnType<typeof desktopLoginom>>) {
  const owner = randomUUID()
  const runs = new Map<
    string,
    { chat: string; lease: NonNullable<ReturnType<typeof service.acquire>>; calls: number; released: boolean }
  >()
  port.on("message", async ({ data }) => {
    if (!data || typeof data !== "object" || typeof data.id !== "string" || typeof data.method !== "string") return
    const input = data.input
    if (!input || typeof input !== "object" || typeof input.run !== "string") return
    try {
      if (data.method === "acquire") {
        if (typeof input.session !== "string" || !input.session || runs.has(input.run))
          throw new Error("LOGINOM_RUN_INVALID")
        const chat = createHash("sha256").update(input.session).digest("hex")
        const recovery = service.recoveries.get(chat)
        const lease = recovery?.resume() ? recovery : recovery ? undefined : service.acquire(`${owner}:${input.run}`)
        if (!lease) {
          port.postMessage({ id: data.id, result: null })
          return
        }
        runs.set(input.run, { chat, lease, calls: 0, released: false })
        port.postMessage({ id: data.id, result: { generation: lease.generation } })
        return
      }
      const run = runs.get(input.run)
      if (!run || run.released) throw new Error("LOGINOM_RUN_INVALID")
      if (data.method === "release") {
        run.released = true
        if (run.calls) {
          run.lease.holdRecovery()
          service.recoveries.set(run.chat, run.lease)
        }
        run.lease.release()
        if (!run.calls) runs.delete(input.run)
        port.postMessage({ id: data.id, result: true })
        return
      }
      if (data.method === "tools") {
        const runtime = await service.runtime(run.lease.generation, "readiness")
        port.postMessage({ id: data.id, result: await runtime.request("list") })
        return
      }
      if (data.method === "admit") {
        const runtime = await service.runtime(run.lease.generation, run.chat)
        if (typeof input.userMessage !== "string" || !Array.isArray(input.files))
          throw new Error("LOGINOM_INPUT_INVALID")
        const files = await service.inputs(run.lease.generation, run.chat, input.userMessage, input.files)
        port.postMessage({
          id: data.id,
          result: await runtime.request("admit", { files, userMessage: input.userMessage }),
        })
        return
      }
      if (data.method === "interrupt") {
        const runtime = await service.runtime(run.lease.generation, run.chat)
        await runtime.request("interrupt")
        port.postMessage({ id: data.id, result: true })
        return
      }
      if (data.method !== "call" || typeof input.name !== "string" || typeof input.userMessage !== "string")
        throw new Error("LOGINOM_CALL_INVALID")
      run.calls++
      try {
        const runtime = await service.runtime(run.lease.generation, run.chat)
        const result = await runtime.request("call", { name: input.name, arguments: input.args })
        if (!result || typeof result !== "object" || !("recoveryPending" in result) || !("result" in result))
          throw new Error("LOGINOM_REPLY_INVALID")
        if (result.recoveryPending) {
          run.lease.holdRecovery()
          service.recoveries.set(run.chat, run.lease)
        }
        if (result.recoveryPending === false) {
          run.lease.reconciled()
          service.recoveries.delete(run.chat)
        }
        port.postMessage({ id: data.id, result: result.result })
      } catch {
        run.lease.holdRecovery()
        service.recoveries.set(run.chat, run.lease)
        throw new Error("LOGINOM_CALL_UNCERTAIN")
      } finally {
        run.calls--
        if (run.released && !run.calls) runs.delete(input.run)
      }
    } catch {
      port.postMessage({ id: data.id, error: "LOGINOM_HOST_REQUEST_FAILED" })
    }
  })
  port.on("close", () => {
    runs.forEach((run) => {
      run.released = true
      if (run.calls) {
        run.lease.holdRecovery()
        service.recoveries.set(run.chat, run.lease)
      }
      run.lease.release()
    })
    runs.clear()
  })
  port.start()
}
