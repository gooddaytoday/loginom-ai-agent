import type { Plugin } from "@opencode/plugin/gui"
import { BuiltinSlot, onIdle } from "@opencode/plugin/gui/builtin"
import { createMemo, lazy, onCleanup, Show, Suspense } from "solid-js"
import { createStore } from "solid-js/store"
import type definition from "./index"
import { failedStep, type State } from "./step-failure/machine"

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const Block = lazy(() => import("./step-failure/block"))
  const [outcomes, setOutcome] = createStore<{ [session: string]: { id: string; state: State } | undefined }>({})
  onCleanup(onIdle(() => void Block.preload()))

  ctx.add(BuiltinSlot, {
    at: "session.timeline.end",
    render(input) {
      const failure = createMemo(() => failedStep(input.session.server.data.session.message.list(input.session.id)))

      return (
        <Show when={failure()?.id} keyed>
          {(id) => {
            const step = failure()

            if (!step) return
            const key = input.session.key

            return (
              <Suspense>
                <Block
                  failure={step}
                  session={input.session}
                  active={input.active}
                  busy={input.busy}
                  state={outcomes[key]?.id === id ? (outcomes[key]?.state ?? { kind: "idle" }) : { kind: "idle" }}
                  update={(state) => setOutcome(key, { id, state })}
                />
              </Suspense>
            )
          }}
        </Show>
      )
    },
  })

  ctx.add(BuiltinSlot, {
    at: "session.sidebar.status",
    render(input) {
      const attention = createMemo(() => {
        if (input.busy) return false
        const server = ctx.servers.get(input.server)
        const id = input.sessionID

        if (!server || !id) return false
        const step = failedStep(server.data.session.message.list(id))

        if (!step) return false
        const current = outcomes[`${server.id}\n${id}`]

        return (
          current?.id !== step.id || (current.state.kind !== "submitted" && current.state.check?.kind !== "applied")
        )
      })

      return (
        <Show when={attention()}>
          <span
            role="img"
            aria-label={ctx.t("failure.attention")}
            title={ctx.t("failure.attention")}
            class="size-1.5 shrink-0 rounded-full bg-v2-state-fg-warning"
          />
        </Show>
      )
    },
  })
}

export default setup
