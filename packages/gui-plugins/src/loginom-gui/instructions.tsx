import { InstructionsDefinition, instructionsMaxBytes } from "@loginom-ai-agent/loginom-host/settings-rpc"
import { usePlugin } from "@opencode/plugin/gui"
import { TextField } from "@opencode/ui/text-field"
import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import type definition from "./index"
import {
  initialInstructions,
  instructionsView,
  transitionInstructions,
  type Event,
  type Request,
  type State,
} from "./instructions-machine"
import { profileDirectory, profileService } from "./profile-service"

export default function Instructions() {
  const ctx = usePlugin<typeof definition>()
  const service = createMemo(() => profileService(ctx))

  return (
    <ctx.ui.SettingsLayout title={ctx.t("instructionsHeading")} description={ctx.t("instructionsDescription")}>
      <ctx.ui.SettingsSection>
        <Show
          when={service()}
          keyed
          fallback={
            <p class="p-4" role="alert">
              {ctx.t("instructionsLoadFailed")}
            </p>
          }
        >
          {(target) => <Editor service={target} />}
        </Show>
      </ctx.ui.SettingsSection>
    </ctx.ui.SettingsLayout>
  )
}

function Editor(props: { service: NonNullable<ReturnType<typeof profileService>> }) {
  const ctx = usePlugin<typeof definition>()
  const rpc = props.service.client.rpc(InstructionsDefinition)
  const controller = new AbortController()
  const [state, setState] = createSignal<State>(initialInstructions)
  const view = createMemo(() => instructionsView(state()))

  async function request(operation: Request) {
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)])
    const result = await (async () => {
      const directory = await profileDirectory(props.service, signal)
      if (!directory) return
      const options = { location: { directory }, signal }
      return operation.type === "load" ? rpc.read({}, options) : rpc.save({ text: operation.text }, options)
    })().catch(() => undefined)
    dispatch({ type: operation.type === "load" ? "loaded" : "saved", attempt: operation.attempt, text: result?.text })
  }

  function dispatch(event: Event) {
    const next = transitionInstructions(state(), event)
    setState(next.state)
    if (next.request) void request(next.request)
  }

  onMount(() => void request({ type: "load", attempt: initialInstructions.attempt }))
  onCleanup(() => {
    dispatch({ type: "disposed" })
    controller.abort()
  })

  return (
    <>
      <Show when={view().loading}>
        <p class="p-4" role="status">
          {ctx.t("instructionsLoading")}
        </p>
      </Show>
      <Show when={view().loadFailed}>
        <div class="flex flex-wrap items-center gap-3 p-4">
          <p role="alert">{ctx.t("instructionsLoadFailed")}</p>
          <ctx.ui.Button onClick={() => dispatch({ type: "retry" })}>{ctx.t("instructionsRetry")}</ctx.ui.Button>
        </div>
      </Show>
      <Show when={view().form}>
        {(form) => (
          <form
            class="flex min-w-0 flex-col gap-4 p-4"
            onSubmit={(event) => {
              event.preventDefault()
              dispatch({ type: "submit" })
            }}
          >
            <TextField
              label={ctx.t("instructionsTitle")}
              placeholder={ctx.t("instructionsExample")}
              description={`${ctx.t("instructionsSkillHint")} ${ctx.t("instructionsCount", {
                used: view().bytes,
                limit: instructionsMaxBytes,
              })}`}
              validationState={view().tooLong ? "invalid" : "valid"}
              error={view().tooLong ? ctx.t("instructionsLimitExceeded") : undefined}
              multiline
              class="min-h-40 max-h-80 overflow-y-auto"
              value={form().text}
              disabled={view().saving}
              onChange={(text) => dispatch({ type: "edit", text })}
            />
            <div class="flex flex-wrap items-center gap-3">
              <ctx.ui.Button variant="contrast" type="submit" disabled={!view().canSave}>
                {ctx.t(view().saving ? "saving" : "save")}
              </ctx.ui.Button>
              <span role="status" class="text-12-regular text-text-base">
                {view().dirty ? ctx.t("instructionsUnsaved") : ""}
              </span>
            </div>
            <Show when={view().saveFailed}>
              <p role="alert" class="text-12-regular text-text-danger-base">
                {ctx.t("instructionsSaveFailed")}
              </p>
            </Show>
          </form>
        )}
      </Show>
    </>
  )
}
