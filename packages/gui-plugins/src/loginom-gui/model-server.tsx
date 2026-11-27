import { Issue, ModelServerRpc } from "@loginom-ai-agent/loginom-host/model-server-rpc"
import { usePlugin } from "@opencode/plugin/gui"
import type { ProviderSetupProps } from "@opencode/plugin/gui/builtin"
import { RadioGroup, RadioItem } from "@opencode/ui/radio"
import { TextField } from "@opencode/ui/text-field"
import { createSignal, For, onCleanup, Show } from "solid-js"
import type definition from "./index"

export default function ModelServer(props: ProviderSetupProps) {
  const ctx = usePlugin<typeof definition>()
  const [address, setAddress] = createSignal("")
  const [key, setKey] = createSignal("")
  const [models, setModels] = createSignal<readonly string[]>([])
  const [selected, setSelected] = createSignal("")
  const [busy, setBusy] = createSignal<"discover" | "save">()
  const [issue, setIssue] = createSignal<typeof Issue.Type>()
  const lifetime = new AbortController()
  onCleanup(() => lifetime.abort())

  const edit = (set: (value: string) => string, value: string) => {
    set(value)
    setModels([])
    setSelected("")
    setIssue(undefined)
  }

  const submit = async (action: "discover" | "save") => {
    if (busy() || !address().trim()) return
    const selection = selected()
    const visible = models()
    const input = { address: address(), key: key() || undefined }
    const rpc = props.client.rpc(ModelServerRpc)
    const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(15_000)])
    setIssue(undefined)
    setBusy(action)
    try {
      if (action === "save") {
        const result = await rpc.save({ ...input, models: visible }, { signal })
        if (lifetime.signal.aborted) return
        if (!result.ok) return void setIssue(result.issue)
        setKey("")
        return await props.onConnected(result.value.providerID, visible, selection, lifetime.signal)
      }
      setModels([])
      setSelected("")
      const result = await rpc.discover(input, { signal })
      if (lifetime.signal.aborted) return
      if (!result.ok) return void setIssue(result.issue)
      setModels(result.value)
      setSelected(result.value[0])
    } catch {
      if (!lifetime.signal.aborted) setIssue(action === "save" ? "modelServerSaveFailed" : "modelServerDiscoveryFailed")
    } finally {
      if (!lifetime.signal.aborted) setBusy(undefined)
    }
  }

  return (
    <form
      class="flex min-h-0 flex-col gap-4 overflow-y-auto px-5 pb-5"
      onSubmit={(event) => {
        event.preventDefault()
        void submit(selected() ? "save" : "discover")
      }}
    >
      <p class="text-13-regular text-text-base">{ctx.t("modelServerDescription")}</p>
      <TextField
        label={ctx.t("url")}
        value={address()}
        inputMode="url"
        autocomplete="off"
        placeholder="http://127.0.0.1:8000/v1"
        disabled={!!busy()}
        onChange={(value) => edit(setAddress, value)}
      />
      <TextField
        label={ctx.t("modelServerKey")}
        type="password"
        autocomplete="off"
        value={key()}
        disabled={!!busy()}
        onChange={(value) => edit(setKey, value)}
      />
      <Show when={models().length > 0}>
        <fieldset class="flex min-w-0 flex-col gap-2 text-12-regular text-text-strong">
          <legend>{ctx.t("modelServerSelect")}</legend>
          <RadioGroup
            value={selected()}
            onChange={setSelected}
            disabled={!!busy()}
            aria-label={ctx.t("modelServerSelect")}
          >
            <For each={models()}>{(id) => <RadioItem value={id} label={id} />}</For>
          </RadioGroup>
        </fieldset>
      </Show>
      <Show when={issue()}>
        {(error) => (
          <p role="alert" class="text-12-regular text-text-danger-base">
            {ctx.t(error())}
          </p>
        )}
      </Show>
      <div class="flex flex-wrap justify-end gap-2">
        <ctx.ui.Button
          type="button"
          variant={selected() ? "neutral" : "contrast"}
          disabled={!address().trim() || !!busy()}
          onClick={() => void submit("discover")}
        >
          {ctx.t(busy() === "discover" ? "modelServerFinding" : "modelServerFind")}
        </ctx.ui.Button>
        <Show when={selected()}>
          <ctx.ui.Button type="submit" variant="contrast" disabled={!!busy()}>
            {ctx.t(busy() === "save" ? "saving" : "modelServerConnect")}
          </ctx.ui.Button>
        </Show>
      </div>
    </form>
  )
}
