import type { Plugin } from "@opencode/plugin/gui"
import { BuiltinSlot, onIdle } from "@opencode/plugin/gui/builtin"
import { createMemo, lazy, onCleanup, Show, Suspense } from "solid-js"
import { createStore, produce } from "solid-js/store"
import type definition from "../index"
import { checkedOperation, recovery, pending, type State } from "./machine"

export const registerStepFailure: Plugin.Setup<typeof definition> = (ctx) => {
  const Block = lazy(() => import("./block"))
  const [outcomes, setOutcome] = createStore<{ [session: string]: { id: string; state: State } | undefined }>({})

  onCleanup(onIdle(() => void Block.preload()))

  ctx.add(BuiltinSlot, {
    at: "session.timeline.end",
    render(input) {
      const current = createMemo(() => recovery(input.session.server.data.session.message.list(input.session.id)))

      return (
        <Show when={current()?.failure.id} keyed>
          {(id) => {
            const initial = current()

            if (!initial) return

            const active = () => {
              const value = current()

              return value?.failure.id === id ? value : initial
            }

            const key = input.session.key

            return (
              <Suspense>
                <Block
                  failure={active().failure}
                  retry={active().retry}
                  session={input.session}
                  active={input.active}
                  busy={input.busy}
                  state={outcomes[key]?.id === id ? (outcomes[key]?.state ?? { kind: "idle" }) : { kind: "idle" }}
                  update={(state) =>
                    setOutcome(
                      produce((draft) => {
                        draft[key] = { id, state }
                      }),
                    )
                  }
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
        const server = ctx.servers.get(input.server)
        const id = input.sessionID

        if (!server || !id) return false
        const current = recovery(server.data.session.message.list(id))

        if (!current || current.retry?.status === "completed") return false
        const entry = outcomes[`${server.id}\n${id}`]
        const state = entry?.id === current.failure.id ? (entry.state ?? { kind: "idle" }) : { kind: "idle" as const }

        return (
          checkedOperation(current.failure, state)?.kind !== "applied" &&
          (!input.busy || !!current.retry || pending(state))
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
