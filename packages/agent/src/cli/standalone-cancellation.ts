import { currentExecutionOrigin, withExecutionOrigin } from "./execution-origin.mjs"

export function standaloneCancellation() {
  return currentExecutionOrigin()?.signal
}

// The invocation owns this handler through host cleanup and profile release. Command-specific handlers
// still perform interruption; repeated signals cannot force an unconfirmed exit.
export async function withStandaloneCancellation(run: (signal: AbortSignal) => Promise<void>) {
  const controller = new AbortController()
  const interrupt = () => controller.abort()
  process.on("SIGINT", interrupt)
  try {
    await withExecutionOrigin(controller, run)
  } finally {
    process.off("SIGINT", interrupt)
  }
}
