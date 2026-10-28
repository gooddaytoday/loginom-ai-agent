const state: { signal?: AbortSignal } = {}

export function standaloneCancellation() {
  return state.signal
}

// The invocation owns this handler through host cleanup and profile release. Command-specific handlers
// still perform interruption; repeated signals cannot force an unconfirmed exit.
export async function withStandaloneCancellation(run: (signal: AbortSignal) => Promise<void>) {
  const controller = new AbortController()
  const interrupt = () => controller.abort()
  state.signal = controller.signal
  process.on("SIGINT", interrupt)
  try {
    await run(controller.signal)
  } finally {
    process.off("SIGINT", interrupt)
    state.signal = undefined
  }
}
