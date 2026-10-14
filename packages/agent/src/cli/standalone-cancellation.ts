const state: { signal?: AbortSignal; run?: Readonly<{signal: AbortSignal; deadline: number}> } = {}

export function standaloneCancellation() {
  return state.signal
}

// Fixed internal producer; no CLI/JSON field supplies this original control.
export function standaloneRunControl() {
  return state.run
}

// The invocation owns this handler through host cleanup and profile release.
// The run budget is the established 7200 seconds, born once before profile/startup awaits.
export async function withStandaloneCancellation(run: (signal: AbortSignal) => Promise<void>, timedRun = false) {
  if (state.signal) throw new Error("CLI_RUN_CONTROL_ACTIVE")
  const controller = new AbortController()
  const interrupt = () => controller.abort()
  state.signal = controller.signal
  const control = timedRun ? Object.freeze({signal: controller.signal, deadline: Date.now() + 7200_000}) : undefined
  state.run = control
  const timer = control ? setTimeout(() => controller.abort(new Error("CLI_CANCELLED")), Math.max(0,control.deadline-Date.now())) : undefined
  process.on("SIGINT", interrupt)
  try {
    await run(controller.signal)
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    process.off("SIGINT", interrupt)
    state.run = undefined
    state.signal = undefined
  }
}
