// Electron does not await async event listeners. Keep the application alive until
// backend shutdown and Host/Chromium cleanup finish, then admit the repeated quit.
export function createQuitHandler(input: {
  markQuitting(): void
  stop(): Promise<void>
  quit(): void
  onError(error: unknown): void
}) {
  let stopped = false
  let stopping: Promise<void> | undefined
  return (event: { preventDefault(): void }) => {
    input.markQuitting()
    if (stopped) return
    event.preventDefault()
    stopping ??= Promise.resolve()
      .then(() => input.stop())
      .catch(input.onError)
      .finally(() => {
        stopped = true
        input.quit()
      })
  }
}
