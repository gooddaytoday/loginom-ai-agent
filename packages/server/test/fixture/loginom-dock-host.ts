import { HostTaskScope } from "../../../loginom-host/src/task-scope"

// A scripted Loginom Host behind the private port of `loginom-host/src/node-client.ts`, for `ServiceHost.start({ connect })`.
// It answers the requests the product plugin sends (`acquire`, `scope`, `tools`, `call`, `admit`, `release`) with the
// task binding rules of `loginom-host/src/host-port.ts`, the current connection generation in every reply, and a
// catalog and call results the test scripts. `log` keeps every request in order.

type Tool = { name: string; description?: string; inputSchema: Record<string, unknown> }
type Scope = typeof HostTaskScope.Info.Type
type Run = { session: string; scope?: Scope; pending?: Scope; prepared: boolean }
type Request = { method: string; input: Record<string, unknown> & { run: string } }

export function scriptedHost(
  options: {
    catalog?: (generation: number) => Tool[]
    call?: (request: Record<string, unknown>) => unknown
    acquire?: () => string | undefined
    tools?: () => string | undefined
    /** Runs start with a browser runtime, as after `dock_prepare`. */
    prepared?: boolean
  } = {},
) {
  const listeners: ((event: { data: unknown }) => void)[] = []
  const runs = new Map<string, Run>()
  const state = { generation: 1 }
  const log: Request[] = []
  const send = (data: unknown) => listeners.forEach((listener) => listener({ data }))

  const handle = (request: Request & { id: string }) => {
    log.push({ method: request.method, input: request.input })
    const reply = (result: unknown) => send({ id: request.id, result, generation: state.generation })
    const fail = (error: string) => send({ id: request.id, error })
    const input = request.input
    if (request.method === "acquire") {
      const refused = options.acquire?.()
      if (refused) return fail(refused)
      runs.set(input.run, { session: String(input.session), prepared: options.prepared ?? false })
      return reply({ generation: state.generation })
    }
    const run = runs.get(input.run)
    if (!run) return fail("LOGINOM_RUN_INVALID")
    if (request.method === "release" || request.method === "interrupt") return reply(true)
    if (request.method === "scope") {
      const mode = input.mode
      const scope = input.scope as Scope
      if (mode === "bind") {
        if (
          run.scope &&
          (run.scope.taskMessageID === scope.taskMessageID
            ? run.scope.profile !== scope.profile
            : scope.profile !== "default")
        )
          return fail("LOGINOM_SCOPE_DENIED")
        run.scope = scope
        run.pending = undefined
        return reply(scope)
      }
      if (mode === "request") {
        if (
          !run.scope ||
          run.scope.taskMessageID !== scope.taskMessageID ||
          scope.profile === "default" ||
          !HostTaskScope.permits(run.pending?.profile ?? run.scope.profile, scope.profile)
        )
          return fail("LOGINOM_SCOPE_DENIED")
        run.pending = scope
        return reply(scope)
      }
      const pending = run.pending
      run.pending = undefined
      if (!pending || pending.taskMessageID !== scope.taskMessageID || pending.profile !== scope.profile)
        return fail("LOGINOM_SCOPE_DENIED")
      run.scope = pending
      return reply(scope)
    }
    if (request.method === "tools") {
      const refused = options.tools?.()
      if (refused) return fail(refused)
      return reply({ tools: options.catalog?.(state.generation) ?? [] })
    }
    if (request.method === "admit") {
      if (run.scope?.profile !== "loginom-automation" || !run.prepared) return fail("LOGINOM_SCOPE_DENIED")
      const files = input.files as { name: string }[]
      return reply(files.map((file, index) => ({ artifact_id: `artifact-${index + 1}`, name: file.name })))
    }
    if (request.method === "call") {
      if (input.name === "dock_prepare") run.prepared = true
      return reply(
        options.call?.(input) ?? { content: [{ type: "text", text: JSON.stringify({ called: input.name }) }] },
      )
    }
    return fail("LOGINOM_HOST_REQUEST_FAILED")
  }

  const port = {
    postMessage: (value: unknown) => queueMicrotask(() => handle(value as Request & { id: string })),
    on: (event: "message", listener: (event: { data: unknown }) => void) => {
      if (event === "message") listeners.push(listener)
    },
    start: () => {},
  }
  return {
    connect: async () => ({ port, close: async () => {} }),
    state,
    log,
    // The requests of one kind, in order.
    requests: (method: string) => log.filter((request) => request.method === method).map((request) => request.input),
  }
}

// A catalog tool as the Host lists it: every Dock schema carries the Host's private context token.
export const dockTool = (name: string, description = `${name} tool`): Tool => ({
  name,
  description,
  inputSchema: {
    type: "object",
    properties: { host_context_token: { type: "string" }, path: { type: "string" } },
    required: ["host_context_token", "path"],
  },
})
