import { fstatSync } from "node:fs"
import { Socket } from "node:net"
import type { LoginBarrier } from "@loginom-ai-agent/loginom-host/supervisor"

const claimed = new Set<number>()
// This module must be the first main-process import. Consume the launcher-only
// selector before shell environment discovery or any backend/runtime is started.
const selected = process.env.LOGINOM_AI_AGENT_DESKTOP_CONTROL_FD
delete process.env.LOGINOM_AI_AGENT_DESKTOP_CONTROL_FD
export const managedDesktopControl = selected === undefined ? undefined : openDesktopManagedControl(selected)

/** An inherited capability, not a renderer API or a socket discovery mechanism.
 * Playwright reserves descriptors 3 and 4; the trusted launcher supplies 5..63.
 * It must isolate the worker and keep this descriptor out of descendants.
 */
export function openDesktopManagedControl(selected: string) {
  const socket = (() => {
    try {
      if (process.platform === "win32" || !/^(?:[5-9]|[1-5][0-9]|6[0-3])$/.test(selected)) throw Error()
      const fd = Number(selected)
      if (String(fd) !== selected || claimed.has(fd) || !fstatSync(fd).isSocket()) throw Error()
      claimed.add(fd)
      return new Socket({ fd, readable: true, writable: true })
    } catch {
      throw Error("DESKTOP_CONTROL_INVALID")
    }
  })()
  const state = {
    bound: false,
    failed: false,
    stopping: false,
    closed: false,
    busy: false,
    buffer: Buffer.alloc(0),
    failure: undefined as (() => void) | undefined,
    waiting: undefined as { expected: string; resolve(): void; reject(error: Error): void } | undefined,
    logins: new Map<string, { binding: string; phase: "authenticated" | "done" }>(),
  }
  function check() {
    if (state.failed || state.stopping || state.closed || socket.destroyed)
      throw Error("LOGINOM_LOGIN_BARRIER_UNKNOWN")
  }
  function fail() {
    if (state.failed || state.closed) return
    state.failed = true
    state.waiting?.reject(Error("LOGINOM_LOGIN_BARRIER_UNKNOWN"))
    state.waiting = undefined
    socket.destroy()
    // The caller stops its own Host; a callback failure cannot reveal an
    // external exception or reopen this permanently failed channel.
    try {
      state.failure?.()
    } catch {}
  }
  socket.on("error", fail)
  socket.on("end", fail)
  socket.on("close", fail)
  socket.on("data", (chunk: Buffer) => {
    if (state.closed || state.failed) return
    if (state.stopping || !state.waiting || state.buffer.length + chunk.length > 256) return fail()
    state.buffer = Buffer.concat([state.buffer, chunk])
    const end = state.buffer.indexOf(10)
    if (end === -1) return
    // A single exact compact ASCII ACK rejects duplicate keys, extra frames,
    // malformed UTF-8 and identities selected by the controller.
    const expected = Buffer.from(state.waiting.expected + "\n")
    if (!state.buffer.equals(expected)) return fail()
    state.buffer = Buffer.alloc(0)
    const waiting = state.waiting
    state.waiting = undefined
    waiting.resolve()
  })
  return {
    abort: fail,
    async bind(root: string, onFailure: () => void): Promise<LoginBarrier> {
      try {
        check()
        if (state.bound || typeof onFailure !== "function") throw Error()
        state.bound = true
        state.failure = onFailure
        const { readSessionRegistration } = await import("@loginom-ai-agent/loginom-host/session-completion")
        const { validateLoginBinding } = await import("@loginom-ai-agent/loginom-host/supervisor")
        const registration = await readSessionRegistration(root)
        check()
        if (registration?.version !== 2) throw Error()
        return async (event) => {
          try {
            check()
            if (state.busy || !event || Object.keys(event).sort().join() !== "binding,phase" ||
                !["begin", "authenticated"].includes(event.phase)) throw Error()
            const phase = event.phase
            const binding = validateLoginBinding(event.binding)
            if (binding.attemptId !== registration.attemptId) throw Error()
            const previous = state.logins.get(binding.loginId)
            const serialized = JSON.stringify(binding)
            if (phase === "begin"
              ? previous || state.logins.size >= 32 || [...state.logins.values()].some((value) => value.phase !== "done")
              : !previous || previous.phase !== "authenticated" || previous.binding !== serialized) throw Error()
            state.busy = true
            if (phase === "begin") state.logins.set(binding.loginId, { binding: serialized, phase: "authenticated" })
            const bytes = Buffer.from(JSON.stringify({ version: 2, type: "login", phase, binding }) + "\n")
            if (bytes.length > 32768) throw Error()
            const timer = setTimeout(fail, 60_000)
            try {
              await new Promise<void>((resolve, reject) => {
                state.waiting = {
                  expected: JSON.stringify({ version: 2, method: "login-ack", loginId: binding.loginId, phase }),
                  resolve, reject,
                }
                socket.write(bytes, (error) => { if (error) fail() })
              })
              check()
              if (phase === "authenticated") state.logins.get(binding.loginId)!.phase = "done"
            } finally {
              clearTimeout(timer)
              state.busy = false
            }
          } catch {
            fail()
            throw Error("LOGINOM_LOGIN_BARRIER_UNKNOWN")
          }
        }
      } catch {
        fail()
        throw Error("LOGINOM_LOGIN_BARRIER_REQUIRED")
      }
    },
    stop() {
      state.stopping = true
      state.waiting?.reject(Error("LOGINOM_LOGIN_BARRIER_UNKNOWN"))
      state.waiting = undefined
    },
    close() {
      state.closed = true
      state.stopping = true
      state.waiting?.reject(Error("LOGINOM_LOGIN_BARRIER_UNKNOWN"))
      state.waiting = undefined
      socket.destroy()
    },
  }
}
