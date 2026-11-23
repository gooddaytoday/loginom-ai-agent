import { createSignal } from "solid-js"

// Desktop «Собрать диагностику»: groups, IPC shapes and the open chat.
export const DIAGNOSTICS_GROUPS = ["chat", "runtime", "logs", "dumps"] as const
export type DiagnosticsGroup = (typeof DIAGNOSTICS_GROUPS)[number]
// Chat on, crash dump off by default (owner decision diagnostics-export, 13.11).
export const DIAGNOSTICS_DEFAULTS: Record<DiagnosticsGroup, boolean> = { chat: true, runtime: true, logs: true, dumps: false }

export type DiagnosticsRequest = { sessionID?: string; chat?: unknown; include: Record<DiagnosticsGroup, boolean> }
export type DiagnosticsFile = { name: string; group: DiagnosticsGroup; status: string; size?: number; reason?: string }
export type DiagnosticsPrepared = { id: string; size: number; selection: string; files: DiagnosticsFile[] }
export type DiagnosticsApi = {
  prepare(request: DiagnosticsRequest): Promise<DiagnosticsPrepared>
  preview(id: string, name: string): Promise<{ text: string; truncated: boolean } | undefined>
  save(id: string): Promise<string | undefined>
}

export type DiagnosticsSession = { sessionID: string; title?: string; chat: () => Promise<unknown> }

// The session page publishes its chat; dialogs render outside the router.
const [active, setActive] = createSignal<DiagnosticsSession>()
export const activeDiagnosticsSession = active

export function publishDiagnosticsSession(session: DiagnosticsSession | undefined) {
  setActive(session)
  return () => {
    if (active() === session) setActive(undefined)
  }
}

export function summarizeDiagnostics(files: DiagnosticsFile[]) {
  return DIAGNOSTICS_GROUPS.map((group) => {
    // manifest.json is in every archive: it is listed but belongs to no chosen group.
    const items = files.filter((file) => file.group === group && file.name !== "manifest.json")
    const included = items.filter((file) => file.status === "included")
    return {
      group,
      included: included.length,
      omitted: items.length - included.length,
      bytes: included.reduce((sum, file) => sum + (file.size ?? 0), 0),
    }
  })
}
