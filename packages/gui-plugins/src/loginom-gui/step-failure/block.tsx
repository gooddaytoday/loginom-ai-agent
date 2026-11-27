import { createKeyed, usePlugin, type MountedSession } from "@opencode/plugin/gui"
import { SessionMessage } from "@opencode/schema/session-message"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { createMemo, createSignal, onCleanup, Show } from "solid-js"
import type definition from "../index"
import { ConnectionRpc, StepRpc, WriteOutcomeRpc } from "./contracts"
import {
  available,
  canRetry,
  needsCheck,
  transition,
  type Check,
  type Event,
  type Failure,
  type State,
} from "./machine"

export default function Block(props: {
  failure: Failure
  session: MountedSession
  active: boolean
  busy: boolean
  state: State
  update: (state: State) => void
}) {
  const ctx = usePlugin<typeof definition>()
  const [connection, setConnection] = createSignal<"checking" | "ready" | "not-ready" | "unknown">("checking")
  const lifetime = new AbortController()
  const retryID = SessionMessage.ID.create()
  const applied = () => props.state.check?.kind === "applied"
  const resolved = createMemo(() => applied() || props.state.kind === "submitted")
  let refresh = () => {}

  onCleanup(() => lifetime.abort())

  const statusClient = () => {
    const server = props.session.server

    if (props.active && !props.busy && !resolved() && server.connected) return server.client
  }

  createKeyed(
    statusClient,
    (client) => {
      const rpc = client.rpc(ConnectionRpc)
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
        const result = await ConnectionRpc.methods.status.output["~standard"].validate(response)

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

  const dispatch = (event: Event) => props.update(transition(props.state, event))
  const failure = props.failure
  const pendingCheck = () => needsCheck(failure, props.state)
  const step = () => props.state.check?.step ?? (failure.kind === "write" ? failure.step : undefined)
  const saved = () => step()?.save?.throughStep.label

  const check = async () => {
    if (failure.kind !== "write" || !pendingCheck() || !available(props.state) || connection() !== "ready") return
    dispatch({ type: "check" })
    const sessionID = props.session.id
    const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(20_000)])
    const options = { signal, location: props.session.location }
    const client = props.session.server.client
    let result: Check = { kind: "unknown" }

    if (failure.operationId) {
      const response = await client
        .rpc(StepRpc)
        .checkState({ sessionID, operationId: failure.operationId }, options)
        .catch(() => undefined)

      const decoded = await StepRpc.methods.checkState.output["~standard"].validate(response)

      if (!decoded.issues && decoded.value.state === "observed") {
        const observed = decoded.value
        result =
          observed.step.outcome === "not_applied"
            ? {
                kind: "not_applied",
                retryAvailable: observed.retryAvailable && observed.step.retryAvailable,
                step: observed.step,
              }
            : { kind: observed.step.outcome === "completed" ? "applied" : "unknown", step: observed.step }
      }
    } else {
      const response = await client
        .rpc(WriteOutcomeRpc)
        .check({ sessionID, writeID: failure.writeID }, options)
        .catch(() => undefined)

      const decoded = await WriteOutcomeRpc.methods.check.output["~standard"].validate(response)

      if (!decoded.issues && failure.writeID && decoded.value.writeID === failure.writeID) {
        const status = decoded.value.status
        result = status === "not_applied" ? { kind: status, retryAvailable: true } : { kind: status }
      }
    }

    if (!lifetime.signal.aborted) dispatch({ type: "checked", result })
  }

  const retry = async () => {
    if (props.busy || connection() !== "ready" || !canRetry(failure, props.state)) return
    dispatch({ type: "retry" })
    const marker = ctx.t("failure.retried")

    const ok = await props.session.server.client.session
      .prompt(
        {
          sessionID: props.session.id,
          id: retryID,
          text: `Retry only the failed Loginom step (${failure.tool}, call ${failure.id}). Verify the original target first. Do not replay preceding steps.`,
          metadata: { displayText: marker, comments: [], attachments: [] },
        },
        { signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(15_000)]) },
      )
      .then(
        () => true,
        () => false,
      )

    if (!lifetime.signal.aborted) dispatch({ type: "retried", ok })
  }

  const copy = async () => {
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
    <Show when={!props.busy && props.state.kind !== "submitted"}>
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
        <Show when={failure.kind === "read"}>
          <p>{ctx.t("failure.read")}</p>
        </Show>
        <Show when={failure.kind === "write"}>
          <p>
            {ctx.t(
              applied()
                ? "failure.applied"
                : props.state.check?.kind === "not_applied"
                  ? "failure.notApplied"
                  : props.state.check?.kind === "unknown"
                    ? "failure.unknown"
                    : "failure.write",
            )}
          </p>
          <p>
            {saved()
              ? ctx.t("failure.saved", { label: saved() ?? "" })
              : ctx.t(step()?.persistence === "step_unsaved" ? "failure.unsaved" : "failure.unconfirmed")}
          </p>
        </Show>
        <Show when={!applied()}>
          <p class="text-v2-text-text-faint">{connectionLabel()}</p>
          <Show when={props.state.kind === "retry-failed"}>
            <p>{ctx.t("failure.retryFailed")}</p>
          </Show>
          <div class="flex flex-wrap items-center gap-2">
            <Show when={pendingCheck()}>
              <Button
                type="button"
                variant="submit"
                disabled={!available(props.state) || connection() !== "ready"}
                onClick={() => void check()}
              >
                {ctx.t(props.state.kind === "checking" ? "failure.checking" : "failure.check")}
              </Button>
            </Show>
            <Button
              type="button"
              variant={pendingCheck() ? "outline" : "submit"}
              disabled={connection() !== "ready" || !canRetry(failure, props.state)}
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
