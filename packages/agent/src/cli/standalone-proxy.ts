import { resolveSystemProxy, type SystemProxyResult } from "@loginom-ai-agent/loginom-host/system-proxy"

const toastCodes = new Set([
  "read-failed",
  "timeout",
  "internal",
  "unreachable",
  "socks-only",
  "auth-required",
  "automatic-unsupported",
  "environment-socks",
])

let pending: SystemProxyResult | undefined

export async function applyCliSystemProxy() {
  const result = await resolveSystemProxy({ environment: process.env }).catch(() => undefined)
  const settled =
    result ??
    ({
      state: "failed",
      summary: { source: "none", noProxy: "", skipped: [] },
      notices: [{ code: "internal" }],
    } satisfies SystemProxyResult)
  if (settled.environment) Object.assign(process.env, settled.environment)
  const line = systemProxyNoticeLine(settled)
  if (line) process.stderr.write(`${line}\n`)
  pending = settled
  return settled
}

export function systemProxyNoticeLine(result: SystemProxyResult) {
  const notice = result.notices.find((item) => toastCodes.has(item.code))
  if (!notice) return
  return `SYSTEM_PROXY_NOT_APPLIED: ${notice.code}${notice.detail ? ` ${notice.detail}` : ""}`
}

export async function publishCliProxyToast() {
  const result = pending
  if (!result) return
  const notice = result.notices.find((item) => toastCodes.has(item.code))
  if (!notice) return
  try {
    const { AppRuntime } = await import("../effect/app-runtime")
    const { EventV2Bridge } = await import("@/event-v2-bridge")
    const { TuiEvent } = await import("@/server/tui-event")
    const { Effect } = await import("effect")
    await AppRuntime.runPromise(
      Effect.gen(function* () {
        const events = yield* EventV2Bridge.Service
        yield* events.publish(TuiEvent.ToastShow, {
          title: "System proxy",
          message: systemProxyNoticeLine(result) ?? notice.code,
          variant: "warning",
          duration: 8000,
        })
      }),
    )
  } catch {
    // TUI мог ещё не подписаться: строка в stderr уже показана.
  }
}
