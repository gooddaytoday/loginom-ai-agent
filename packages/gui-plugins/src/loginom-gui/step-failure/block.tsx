import { ConnectionSettingsRpc } from "@loginom-ai-agent/loginom-host/settings-rpc"
import { createKeyed, usePlugin, type MountedSession } from "@opencode/plugin/gui"
import { SessionMessage } from "@opencode/schema/session-message"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { createMemo, createSignal, onCleanup, Show } from "solid-js"
import type definition from "../index"
import { WriteOutcomeRpc } from "./contracts"
import {
  canRetry,
  checkedOperation,
  needsCheck,
  pending,
  transition,
  type Check,
  type Event,
  type Failure,
  type Retry,
  type State,
} from "./machine"

export default function Block(props: {
  failure: Failure
  session: MountedSession
  active: boolean
  busy: boolean
  retry?: Retry
  state: State
  update: (state: State) => void
}) {
  const ctx = usePlugin<typeof definition>()
  const [connection, setConnection] = createSignal<"checking" | "ready" | "not-ready" | "unknown">("checking")
  const lifetime = new AbortController()
  const checked = () => checkedOperation(props.failure, props.state)
  const applied = () => checked()?.kind === "applied"
  const resolved = createMemo(() => props.retry?.status === "completed" || applied())
  const waiting = () => pending(props.state, props.retry)
  let refresh = () => {}

  const statusClient = () => {
    const server = props.session.server

    if (props.active && !props.busy && !resolved() && server.connected) return server.client
  }

  createKeyed(
    statusClient,
    (client) => {
      const rpc = client.rpc(ConnectionSettingsRpc)
      const loop = new AbortController()
      let timer: ReturnType<typeof setTimeout> | undefined
      let request: AbortController | undefined

      const poll = async (manual: boolean) => {
        clearTimeout(timer)
        request?.abort()
        const current = new AbortController()
        request = current

        if (manual) setConnection("checking")
        const signal = AbortSignal.any([current.signal, loop.signal, AbortSignal.timeout(5000)])
        const directory = props.session.server.data.location.default().directory || props.session.location?.directory

        const response = await rpc
          .status({}, { signal, location: directory ? { directory } : undefined })
          .catch(() => undefined)

        if (loop.signal.aborted || current.signal.aborted) return
        const result = await ConnectionSettingsRpc.methods.status.output["~standard"].validate(response)

        if (loop.signal.aborted || current.signal.aborted) return
        setConnection(
          result.issues || !result.value.ok
            ? "unknown"
            : result.value.value.state === "ready" && !result.value.value.failed
              ? "ready"
              : "not-ready",
        )
        timer = setTimeout(() => void poll(false), 4000)
      }

      refresh = () => void poll(true)
      onCleanup(() => {
        loop.abort()
        clearTimeout(timer)
        refresh = () => {}
      })
      void poll(true)
    },
    { otherwise: () => setConnection("unknown") },
  )

  const dispatch = (event: Event) => {
    const state = props.state
    const next = transition(state, event)

    if (next !== state) props.update(next)
  }

  onCleanup(() => {
    lifetime.abort()
    dispatch({ type: "detach" })
  })

  const operation = () => (props.failure.kind === "write" ? props.failure.operationId : undefined)
  const pendingCheck = () => needsCheck(props.failure, props.state, props.retry)

  const canCheck = () =>
    pendingCheck() &&
    !waiting() &&
    !props.busy &&
    props.state.kind !== "checking" &&
    props.session.server.connected &&
    !!operation()

  const historyStep = () => (props.failure.kind === "write" ? props.failure.step : undefined)
  const saved = () => (historyStep()?.save ?? checked()?.step?.save)?.throughStep.label
  const unsaved = () => historyStep()?.persistence === "step_unsaved" || checked()?.step?.persistence === "step_unsaved"

  const check = async () => {
    const operationId = operation()

    if (!operationId || !canCheck()) return
    dispatch({ type: "check" })
    const sessionID = props.session.id
    const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(40_000)])
    const options = { signal, location: props.session.location }
    let result: Check = { kind: "unknown", operationId }

    const response = await props.session.server.client
      .rpc(WriteOutcomeRpc)
      .check({ sessionID, operationId }, options)
      .catch(() => undefined)

    const decoded = await WriteOutcomeRpc.methods.check.output["~standard"].validate(response)

    if (!decoded.issues && decoded.value.operationId === operationId && operation() === operationId) {
      const { status, step } = decoded.value
      result =
        status === "not_applied"
          ? { kind: status, operationId, step, retryAvailable: step?.outcome === "not_applied" && step.retryAvailable }
          : { kind: status, operationId, step }
    }

    if (!lifetime.signal.aborted) dispatch({ type: "checked", result })
  }

  const retry = async () => {
    const failure = props.failure

    if (props.busy || connection() !== "ready" || !canRetry(failure, props.state, props.retry)) return
    const requestID = props.state.kind === "retry-send-failed" ? props.state.requestID : SessionMessage.ID.create()
    dispatch({ type: "retry", requestID })

    const ok = await props.session.server.client.session
      .prompt(
        {
          sessionID: props.session.id,
          id: requestID,
          text: `Retry only the failed Loginom step (${failure.tool}, call ${failure.id}). Verify the original target first. Do not replay preceding steps.`,
          metadata: {
            loginomRetry: failure.id,
            displayText: ctx.t("failure.retrySent"),
            comments: [],
            attachments: [],
          },
        },
        { signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(15_000)]) },
      )
      .then(
        () => true,
        () => false,
      )

    if (!lifetime.signal.aborted) dispatch({ type: "retried", ok, requestID })
  }

  const copy = async () => {
    const failure = props.failure
    const code = failure.kind === "read" ? "LOGINOM_READ_FAILED" : "LOGINOM_WRITE_OUTCOME_CHECK_REQUIRED"
    const text = ctx.t(failure.kind === "read" ? "failure.read" : "failure.write")

    const ok = await ctx.system.copy(`${code}: ${text}`).then(
      () => true,
      () => false,
    )

    if (!lifetime.signal.aborted)
      ctx.toast.show({ title: ctx.t(ok ? "failure.copied" : "failure.copyFailed"), variant: ok ? "success" : "error" })
  }

  const connectionLabel = () => {
    switch (connection()) {
      case "checking":
        return ctx.t("failure.connectionChecking")
      case "ready":
        return ctx.t("failure.connectionReady")
      case "not-ready":
        return ctx.t("failure.connectionNotReady")
      case "unknown":
        return ctx.t("failure.connectionUnknown")
    }
  }

  return (
    <Show
      when={props.retry?.status !== "completed" && (!props.busy || waiting() || props.retry !== undefined)}
      fallback={props.retry?.status === "completed" ? <p role="status">{ctx.t("failure.retried")}</p> : undefined}
    >
      <section
        class="flex flex-col gap-2 rounded-lg border border-v2-border-border-muted p-4 text-13-regular text-v2-text-text-base"
        role="status"
      >
        <h2 class="flex items-center gap-2 text-14-medium">
          <Icon
            name={applied() ? "circle-check" : "outline-hexagonal-warning"}
            size="small"
            class={applied() ? "text-v2-state-fg-success" : "text-v2-state-fg-danger"}
          />
          {ctx.t(applied() ? "failure.appliedTitle" : pendingCheck() ? "failure.checkTitle" : "failure.title")}
        </h2>
        <Show when={props.failure.kind === "read"}>
          <p>{ctx.t("failure.read")}</p>
        </Show>
        <Show when={props.failure.kind === "write"}>
          <p>
            {ctx.t(
              applied()
                ? "failure.applied"
                : checked()?.kind === "not_applied"
                  ? "failure.notApplied"
                  : checked()?.kind === "unknown"
                    ? "failure.unknown"
                    : "failure.write",
            )}
          </p>
          <p>
            {saved()
              ? ctx.t("failure.saved", { label: saved() ?? "" })
              : ctx.t(unsaved() ? "failure.unsaved" : "failure.unconfirmed")}
          </p>
        </Show>
        <Show when={!applied()}>
          <p class="text-v2-text-text-faint">{connectionLabel()}</p>
          <Show when={waiting()}>
            <p>{ctx.t("failure.retryPending")}</p>
          </Show>
          <Show when={props.state.kind === "retry-send-failed" && props.retry?.id !== props.state.requestID}>
            <p>{ctx.t("failure.retryFailed")}</p>
          </Show>
          <Show when={!waiting() && props.retry?.status === "failed"}>
            <p>{ctx.t("failure.retryUnconfirmed")}</p>
          </Show>
          <div class="flex flex-wrap items-center gap-2">
            <Show when={pendingCheck()}>
              <Button type="button" variant="submit" disabled={!canCheck()} onClick={() => void check()}>
                {ctx.t(props.state.kind === "checking" ? "failure.checking" : "failure.check")}
              </Button>
            </Show>
            <Button
              type="button"
              variant={pendingCheck() ? "outline" : "submit"}
              disabled={props.busy || connection() !== "ready" || !canRetry(props.failure, props.state, props.retry)}
              onClick={() => void retry()}
            >
              {ctx.t("failure.retry")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={connection() === "checking" || !props.session.server.connected}
              onClick={() => refresh()}
            >
              {ctx.t("failure.checkConnection")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => void copy()}>
              {ctx.t("failure.copy")}
            </Button>
          </div>
        </Show>
      </section>
    </Show>
  )
}
