const state: { signal?: AbortSignal; cleanup?: () => void } = {}

export function standaloneCancellation() {
  return state.signal
}

export function handoffStandaloneCancellation(): void {
  state.cleanup?.()
}

// The invocation owns this handler through host cleanup and profile release. Command-specific handlers
// still perform interruption; repeated signals cannot force an unconfirmed exit.
export async function withStandaloneCancellation(run: (signal: AbortSignal) => Promise<void>) {
  const controller = new AbortController()
  const interrupt = () => controller.abort()
  state.signal = controller.signal
  process.on("SIGINT", interrupt)
  state.cleanup = () => {
    process.off("SIGINT", interrupt)
    state.signal = undefined
    state.cleanup = undefined
  }
  try {
    await run(controller.signal)
  } finally {
    handoffStandaloneCancellation()
  }
}
