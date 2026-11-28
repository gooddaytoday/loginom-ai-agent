import { documentationPermissions, Runner, waitForRunner } from "@loginom-ai-agent/loginom-host/runner-rpc"
import type { ServerRef } from "@opencode/plugin/gui"
import { uuid } from "@opencode/util/uuid"
import { documentationPrompt, historyResult, type Outcome, type Run } from "./documentation-run"
import { type State, transition } from "./documentation-machine"

const requestTimeout = 15_000

const executionTimeout = 300_000

export function documentationDriver(state: () => State, write: (updater: (state: State) => State) => void) {
  const lifetime = new AbortController()

  const request = (timeout = requestTimeout) => ({
    signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(timeout)]),
  })

  const dispatch = (event: Parameters<typeof transition>[1]) => write((state) => transition(state, event))

  function finish(attempt: string, outcome: Outcome, run?: Run) {
    dispatch({ type: "finish", attempt, result: { outcome, run } })
  }

  function preparing(attempt: string) {
    const current = state()

    return current.kind === "preparing" && current.attempt === attempt && current.intent === "start"
  }

  async function start(target: ServerRef, model: { id: string; providerID: string }, title: string) {
    const attempt = uuid()
    dispatch({ type: "start", attempt })

    if (!preparing(attempt)) return

    const form = state().form
    const client = target.client
    const runner = client.rpc(Runner)
    const cleanup = () => ({ signal: AbortSignal.timeout(requestTimeout) })
    const finishCopy = (keep: boolean) => runner.finishDocumentation({ runID: attempt, keep }, cleanup())
    const discardCopy = () => finishCopy(false).then(() => true, () => false)
    const readiness = request(5_000)

    const ready = await waitForRunner(() => runner.ready({}, readiness), readiness.signal).then(
      () => true,
      () => false,
    )

    if (!ready || !preparing(attempt)) {
      finish(attempt, preparing(attempt) ? "failed" : "stopped")

      return
    }

    const prepared = await runner
      .prepareDocumentation({ packagePath: form.path.trim(), runID: attempt }, request())
      .catch(() => undefined)

    if (!prepared) {
      const removed = await discardCopy()
      finish(attempt, removed ? (preparing(attempt) ? "failed" : "stopped") : "unknown")

      return
    }

    const location = { directory: prepared.directory }
    const startup = request(5_000)

    const session = await (async () => {
      await waitForRunner(() => runner.ready({}, { ...startup, location }), startup.signal)

      if (!preparing(attempt)) return

      return client.session
        .create(
          {
            title,
            agent: "build",
            location,
            model,
            permissions: documentationPermissions(prepared.filename, form.formats),
          },
          request(),
        )
        .then(
          (value) => ({ kind: "created" as const, value }),
          () => ({ kind: "uncertain" as const }),
        )
    })().catch(() => undefined)

    const run =
      session?.kind === "created"
        ? { ...prepared, server: target.id, sessionID: session.value.id, formats: form.formats }
        : undefined

    const admission =
      run && preparing(attempt)
        ? await runner
            .start(
              {
                sessionID: run.sessionID,
                profile: "package-docs",
                documentationFile: run.filename,
                customDocumentation: form.content === "custom",
                text: documentationPrompt(run.filename, form.formats, form.content, form.description.trim()),
              },
              { ...request(), location },
            )
            .then(
              (value) => (value.granted ? "admitted" : "denied"),
              () => "uncertain",
            )
        : "denied"

    if (admission === "denied") {
      const sessionRemoved =
        !run ||
        (await client.session.remove({ sessionID: run.sessionID }, cleanup()).then(
          () => true,
          () => false,
        ))

      const copyRemoved = await discardCopy()

      const outcome =
        !sessionRemoved || !copyRemoved || session?.kind === "uncertain"
          ? "unknown"
          : preparing(attempt)
            ? "failed"
            : "stopped"

      finish(attempt, outcome)

      return
    }

    void finishCopy(true).catch(() => undefined)

    const current = state()
    const stopRequested = current.kind === "preparing" && current.attempt === attempt && current.intent === "stop"

    if (!run || (admission === "uncertain" && !stopRequested)) {
      finish(attempt, "unknown", run)

      return
    }

    dispatch({ type: "admitted", attempt, run })

    if (stopRequested) return interrupt(target, run, attempt)

    await observe(target, run, attempt, executionTimeout, true)
  }

  async function observe(target: ServerRef, run: Run, attempt: string, timeout: number, track: boolean) {
    const input = { sessionID: run.sessionID }
    const observation = new AbortController()
    const signal = AbortSignal.any([observation.signal, request(timeout).signal])

    const refresh = (signal: AbortSignal) =>
      target.client.session.context(input, { signal }).then((history) => historyResult(run, history))

    const progress = async () => {
      while (!signal.aborted) {
        const current = state()

        if ((current.kind !== "running" && current.kind !== "stopping") || current.attempt !== attempt) {
          observation.abort()

          return
        }

        const evidence = await refresh(AbortSignal.any([signal, AbortSignal.timeout(requestTimeout)])).catch(
          () => undefined,
        )

        if (evidence && !signal.aborted) dispatch({ type: "progress", attempt, evidence })
        await new Promise((resolve) => setTimeout(resolve, 1_500))
      }
    }

    if (track) void progress()

    try {
      await target.client.experimental.session.wait(input, { signal })
      const evidence = await refresh(signal)
      dispatch({ type: "finish", attempt, result: { outcome: evidence.outcome, evidence, run } })
    } catch {
      finish(attempt, "unknown", run)
    } finally {
      observation.abort()
    }
  }

  async function interrupt(target: ServerRef | undefined, run: Run, attempt: string) {
    const stopped =
      target &&
      (await target.client.session.interrupt({ sessionID: run.sessionID, resume: false }, request()).then(
        () => true,
        () => false,
      ))

    if (stopped) await observe(target, run, attempt, requestTimeout, false)
    else finish(attempt, "unknown", run)
  }

  function stop(server: (id: string) => ServerRef | undefined) {
    const current = state()
    dispatch({ type: "stop" })

    if (current.kind === "running") void interrupt(server(current.run.server), current.run, current.attempt)
  }

  function check(server: (id: string) => ServerRef | undefined) {
    const current = state()

    if (current.kind !== "result" || current.outcome !== "unknown" || !current.run) return

    const target = server(current.run.server)

    if (!target) return

    const attempt = uuid()
    dispatch({ type: "check", attempt })
    void observe(target, current.run, attempt, requestTimeout, false)
  }

  return {
    start,
    stop,
    check,
    dispatch,
    dispose() {
      dispatch({ type: "dispose" })
      lifetime.abort()
    },
  }
}
