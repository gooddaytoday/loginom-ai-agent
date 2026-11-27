import { createLatest, usePlugin, type Plugin } from "@opencode/plugin/gui"
import { BuiltinSlot, type BuiltinSlotMap } from "@opencode/plugin/gui/builtin"
import { Definition, Report } from "@opencode/schema/loginom-app-verified"
import { Icon } from "@opencode/ui/icon"
import { Schema } from "effect"
import { createMemo, For, Show } from "solid-js"
import type definition from "./index"
import { loginomStepPhrase } from "./step-phrase"

const decodeReport = Schema.decodeUnknownSync(Report)

function AppVerified(input: BuiltinSlotMap["session.turn.result"]) {
  const ctx = usePlugin<typeof definition>()

  const request = createMemo(
    () => {
      const hasLoginomStep = input.messages.some((message) =>
        message.content.some((part) => part.type === "tool" && part.name.startsWith("loginom_dock_")),
      )

      if (!hasLoginomStep) return

      const session = input.session
      const location = session.location

      if (!location) return

      return { client: session.server.client, location, sessionID: session.id }
    },
    undefined,
    {
      equals: (left, right) =>
        left?.client === right?.client &&
        left?.location.directory === right?.location.directory &&
        left?.location.workspaceID === right?.location.workspaceID &&
        left?.sessionID === right?.sessionID,
    },
  )

  return (
    <Show when={request()} keyed>
      {({ client, location, sessionID }) => {
        const summary = createLatest(
          () => input.promptID,
          async (promptID, signal) =>
            decodeReport(await client.rpc(Definition).summary({ sessionID, promptID }, { location, signal })),
        )

        return (
          <Show when={summary.latest?.facts.length ? summary.latest : undefined}>
            {(report) => (
              <section
                aria-label={ctx.t("verified.title")}
                class="mt-6 mb-3 w-full min-w-0 rounded-lg border border-v2-border-border-base px-3 py-2.5"
              >
                <h3 class="flex items-center gap-1.5 text-14-medium text-v2-state-fg-success">
                  <Icon name="circle-check" size="small" />
                  {ctx.t("verified.title")}
                </h3>
                <ul class="my-2 list-disc space-y-1 pl-5 text-14-regular">
                  <For each={report().facts}>
                    {(fact) => (
                      <li>
                        <button
                          type="button"
                          class="block max-w-full cursor-pointer text-left break-words text-v2-text-text-accent underline-offset-2 hover:underline"
                          onClick={() => input.revealTool(fact.source.toolCallID)}
                        >
                          {loginomStepPhrase(ctx, fact.evidence)}
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
                <Show when={report().notVerified.length > 0}>
                  <p class="text-13-regular text-v2-text-text-muted">
                    <strong>{ctx.t("verified.unchecked")}</strong>
                    {" · "}
                    {report()
                      .notVerified.map((reason) => ctx.t(`verified.reason.${reason}`))
                      .join(" · ")}
                  </p>
                </Show>
              </section>
            )}
          </Show>
        )
      }}
    </Show>
  )
}

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  ctx.add(BuiltinSlot, { at: "session.turn.result", render: AppVerified })
}

export default setup
