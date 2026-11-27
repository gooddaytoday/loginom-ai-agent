import { InstructionsDefinition } from "@loginom-ai-agent/loginom-host/settings-rpc"
import { usePlugin } from "@opencode/plugin/gui"
import { TextField } from "@opencode/ui/text-field"
import { createMemo, createResource, createSignal, onCleanup, Show } from "solid-js"
import type definition from "./index"
import { profileClient } from "./profile-client"

export default function Instructions() {
  const ctx = usePlugin<typeof definition>()
  const client = createMemo(() => profileClient(ctx))

  return (
    <ctx.ui.SettingsLayout title={ctx.t("instructionsHeading")} description={ctx.t("instructionsDescription")}>
      <ctx.ui.SettingsSection>
        <Show
          when={client()}
          keyed
          fallback={
            <p class="p-4" role="alert">
              {ctx.t("instructionsLoadFailed")}
            </p>
          }
        >
          {(target) => <Editor client={target} />}
        </Show>
      </ctx.ui.SettingsSection>
    </ctx.ui.SettingsLayout>
  )
}

function Editor(props: { client: NonNullable<ReturnType<typeof profileClient>> }) {
  const ctx = usePlugin<typeof definition>()
  const rpc = props.client.rpc(InstructionsDefinition)
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  const options = () => ({ signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]) })
  const [saved, { mutate }] = createResource(() => rpc.read({}, options()).catch(() => undefined))
  const [draft, setDraft] = createSignal<string>()
  const [saving, setSaving] = createSignal(false)
  const [failed, setFailed] = createSignal(false)
  const text = () => draft() ?? saved()?.text ?? ""
  const dirty = () => text() !== saved()?.text

  const save = async () => {
    if (!saved() || !dirty() || saving()) return
    setSaving(true)
    setFailed(false)
    const result = await rpc.save({ text: text() }, options()).catch(() => undefined)

    if (result) {
      mutate(result)
      setDraft(undefined)
    } else setFailed(true)
    setSaving(false)
  }

  return (
    <Show
      when={!saved.loading}
      fallback={
        <p class="p-4" role="status">
          {ctx.t("instructionsLoading")}
        </p>
      }
    >
      <Show
        when={saved()}
        fallback={
          <p class="p-4" role="alert">
            {ctx.t("instructionsLoadFailed")}
          </p>
        }
      >
        <form
          class="flex min-w-0 flex-col gap-4 p-4"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <TextField
            label={ctx.t("instructionsTitle")}
            placeholder={ctx.t("instructionsExample")}
            description={ctx.t("instructionsSkillHint")}
            multiline
            class="min-h-40"
            value={text()}
            disabled={saving()}
            onChange={setDraft}
          />
          <div class="flex flex-wrap items-center gap-3">
            <ctx.ui.Button variant="contrast" type="submit" disabled={!dirty() || saving()}>
              {ctx.t(saving() ? "saving" : "save")}
            </ctx.ui.Button>
            <span role="status" class="text-12-regular text-text-base">
              {dirty() ? ctx.t("instructionsUnsaved") : ""}
            </span>
          </div>
          <Show when={failed()}>
            <p role="alert" class="text-12-regular text-text-danger-base">
              {ctx.t("instructionsSaveFailed")}
            </p>
          </Show>
        </form>
      </Show>
    </Show>
  )
}
