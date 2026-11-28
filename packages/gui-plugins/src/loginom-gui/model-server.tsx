import { ModelServerRpc } from "@loginom-ai-agent/loginom-host/model-server-rpc"
import { usePlugin } from "@opencode/plugin/gui"
import type { ProviderSetupProps } from "@opencode/plugin/gui/builtin"
import { RadioGroup, RadioItem } from "@opencode/ui/radio"
import { TextField } from "@opencode/ui/text-field"
import { createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import type definition from "./index"
import { initial, transition, view, type Event, type State } from "./model-server-machine"

export default function ModelServer(props: ProviderSetupProps) {
  const ctx = usePlugin<typeof definition>()
  const [state, setState] = createSignal<State>(initial)
  const fields = createMemo(() => view(state()))
  const dispatch = (event: Event) => setState((current) => transition(current, event))
  const lifetime = new AbortController()
  onCleanup(() => {
    dispatch({ type: "disposed" })
    lifetime.abort()
  })

  const submit = async (action: "discover" | "save") => {
    const attempt = Symbol()
    const request = dispatch({ type: "requested", action, attempt })

    if (!("attempt" in request) || request.attempt !== attempt) return

    const input = { address: request.address, key: request.key || undefined }
    const rpc = props.client.rpc(ModelServerRpc)
    const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(15_000)])
    const options = { signal, location: props.location }

    try {
      if (request.status === "saving") {
        const result = await rpc.save({ ...input, models: request.models }, options)

        if (!result.ok) return void dispatch({ type: "settled", attempt, issue: result.issue })

        dispatch({ type: "stored", attempt })
        await props.onConnected(result.value.providerID, request.models, request.selected, lifetime.signal)
        dispatch({ type: "settled", attempt })

        return
      }

      const result = await rpc.discover(input, options)

      if (!result.ok) return void dispatch({ type: "settled", attempt, issue: result.issue })
      dispatch({ type: "discovered", attempt, models: result.value, selected: result.value[0] })
    } catch {
      dispatch({
        type: "settled",
        attempt,
        issue: action === "save" ? "modelServerSaveFailed" : "modelServerDiscoveryFailed",
      })
    }
  }

  return (
    <form
      class="flex min-h-0 flex-col gap-4 overflow-y-auto px-5 pb-5"
      onSubmit={(event) => {
        event.preventDefault()
        void submit(fields().selected ? "save" : "discover")
      }}
    >
      <p class="text-13-regular text-text-base">{ctx.t("modelServerDescription")}</p>
      <TextField
        label={ctx.t("url")}
        value={fields().address}
        inputMode="url"
        autocomplete="off"
        placeholder="http://127.0.0.1:8000/v1"
        disabled={!!fields().busy}
        onChange={(value) => dispatch({ type: "edited", field: "address", value })}
      />
      <TextField
        label={ctx.t("modelServerKey")}
        type="password"
        autocomplete="off"
        value={fields().key}
        disabled={!!fields().busy}
        onChange={(value) => dispatch({ type: "edited", field: "key", value })}
      />
      <Show when={fields().models.length > 0}>
        <fieldset class="flex min-w-0 flex-col gap-2 text-12-regular text-text-strong">
          <legend>{ctx.t("modelServerSelect")}</legend>
          <RadioGroup
            value={fields().selected}
            onChange={(model) => dispatch({ type: "selected", model })}
            disabled={!!fields().busy}
            aria-label={ctx.t("modelServerSelect")}
          >
            <For each={fields().models}>{(id) => <RadioItem value={id} label={id} />}</For>
          </RadioGroup>
        </fieldset>
      </Show>
      <Show when={fields().issue}>
        {(error) => (
          <p role="alert" class="text-12-regular text-text-danger-base">
            {ctx.t(error())}
          </p>
        )}
      </Show>
      <div class="flex flex-wrap justify-end gap-2">
        <ctx.ui.Button
          type="button"
          variant={fields().selected ? "neutral" : "contrast"}
          disabled={!fields().address.trim() || !!fields().busy}
          onClick={() => void submit("discover")}
        >
          {ctx.t(fields().busy === "discover" ? "modelServerFinding" : "modelServerFind")}
        </ctx.ui.Button>
        <Show when={fields().selected}>
          <ctx.ui.Button type="submit" variant="contrast" disabled={!!fields().busy}>
            {ctx.t(fields().busy === "save" ? "saving" : "modelServerConnect")}
          </ctx.ui.Button>
        </Show>
      </div>
    </form>
  )
}
