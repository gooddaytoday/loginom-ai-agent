/** The VPN wrapper owns a bounded system service; the harness never signals its root chain. */
export async function runJudgeUnit(input: {
  cmd: string[]; cwd: string; env: Record<string, string>; timeoutMs: number; stdin?: string; signal?: AbortSignal
}) {
  if (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs < 1 || input.timeoutMs > 86_400_000)
    throw Error("Invalid judge unit timeout")
  const startedAt = Date.now()
  if (input.signal?.aborted) return { stdout: "", stderr: "", exitCode: -1, timedOut: false, interrupted: true,
    startedAt, durationMs: 0, unit: null, cleanupConfirmed: true, cleanupError: null }
  const unit = `loginom-evals-judge-${crypto.randomUUID()}`
  const process = Bun.spawn(input.cmd, { cwd: input.cwd, env: { ...input.env, LOGINOM_EVALS_JUDGE_UNIT: unit,
    LOGINOM_EVALS_JUDGE_TIMEOUT_SEC: String(Math.ceil(input.timeoutMs / 1000)) }, stdin: "pipe", stdout: "pipe", stderr: "pipe" })
  process.stdin.write(input.stdin ?? "")
  process.stdin.end()
  const output = ["", ""]
  const completed = Promise.all([process.stdout, process.stderr].map(async (stream, index) => {
    const decoder = new TextDecoder()
    for await (const chunk of stream) output[index] += decoder.decode(chunk, { stream: true })
    output[index] += decoder.decode()
  })).then(() => process.exited)
  // Include systemd's five-second stop limit and wrapper transport in one deadline.
  const deadline = startedAt + input.timeoutMs + 10_000
  const exitCode = await beforeDeadline(completed, deadline)
  if (exitCode === null) return { stdout: output[0]!, stderr: output[1]!, exitCode: -1, timedOut: true,
    interrupted: Boolean(input.signal?.aborted), startedAt, durationMs: Date.now() - startedAt, unit,
    cleanupConfirmed: false, cleanupError: "Judge wrapper did not exit before its deadline" }
  const inspect = Bun.spawn(["systemctl", "show", `${unit}.service`, "--property=LoadState", "--property=ActiveState", "--property=MainPID"],
    { env: input.env, stdout: "pipe", stderr: "ignore" })
  const observation = await beforeDeadline(Promise.all([new Response(inspect.stdout).text(), inspect.exited]), deadline)
  if (!observation) return { stdout: output[0]!, stderr: output[1]!, exitCode, timedOut: true,
    interrupted: Boolean(input.signal?.aborted), startedAt, durationMs: Date.now() - startedAt, unit,
    cleanupConfirmed: false, cleanupError: "Judge unit lookup exceeded its deadline" }
  const state = Object.fromEntries(observation[0].trim().split("\n").map(line => line.split("=")))
  const inspected = observation[1]
  const confirmed = (inspected === 0 || inspected === 4 && state.LoadState === "not-found") &&
    ["loaded", "not-found"].includes(state.LoadState ?? "") && ["inactive", "failed"].includes(state.ActiveState ?? "") && state.MainPID === "0"
  return { stdout: output[0]!, stderr: output[1]!, exitCode, timedOut: false, interrupted: Boolean(input.signal?.aborted),
    startedAt, durationMs: Date.now() - startedAt, unit, cleanupConfirmed: confirmed,
    cleanupError: confirmed ? null : "Judge systemd unit termination unconfirmed" }
}

function beforeDeadline<T>(work: Promise<T>, deadline: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([work, new Promise<null>(resolve => {
    timer = setTimeout(() => resolve(null), Math.max(0, deadline - Date.now()))
  })]).finally(() => clearTimeout(timer))
}
