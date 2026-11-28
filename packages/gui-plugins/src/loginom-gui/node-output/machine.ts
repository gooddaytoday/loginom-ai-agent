import type { OutputRows, OutputSample } from "../node-output"

export type SampleState =
  | { kind: "historical" }
  | { kind: "loading" }
  | { kind: "fresh"; rows: OutputRows }
  | { kind: "unavailable" }
  | { kind: "timeout" }

const timeoutMs = 8_000

export function requestSample(input: {
  load: (signal: AbortSignal) => Promise<OutputSample | undefined>
  update: (state: SampleState) => void
}) {
  const controller = new AbortController()
  input.update({ kind: "loading" })

  const timer = setTimeout(() => {
    controller.abort()
    input.update({ kind: "timeout" })
  }, timeoutMs)

  const finish = (result?: OutputSample) => {
    if (controller.signal.aborted) return
    clearTimeout(timer)
    input.update(result?.kind === "available" ? { kind: "fresh", rows: result.rows } : { kind: "unavailable" })
  }

  void input.load(controller.signal).then(finish, () => finish())

  return () => {
    clearTimeout(timer)
    controller.abort()
  }
}
