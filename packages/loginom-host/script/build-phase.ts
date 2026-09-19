// Build diagnostics carry phase names and durations, never environment values.
export async function buildPhase<T>(name: string, run: () => PromiseLike<T>) {
  const started = Date.now()
  console.log(`[build] ${new Date(started).toISOString()} BEGIN ${name}`)
  const result = await run()
  console.log(`[build] ${new Date().toISOString()} END ${name} ${Date.now() - started}ms`)
  return result
}
