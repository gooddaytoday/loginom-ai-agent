import { InstructionsDefinition, instructionsBytes, instructionsMaxBytes } from "@loginom-ai-agent/loginom-host/settings-rpc"
import { usePlugin } from "@opencode/plugin/gui"
import { TextField } from "@opencode/ui/text-field"
import { createMemo, createResource, createSignal, onCleanup, Show } from "solid-js"
import type definition from "./index"
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
  onCleanup(() => controller.abort())
  const options = async () => {
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)])
    const directory = await profileDirectory(props.service, signal)
    return directory ? { location: { directory }, signal } : undefined
  }
  const [saved, { mutate }] = createResource(async () => {
    const target = await options()
    return target && rpc.read({}, target).catch(() => undefined)
  })
  const [draft, setDraft] = createSignal<string>()
  const [saving, setSaving] = createSignal(false)
  const [failed, setFailed] = createSignal(false)
  const text = () => draft() ?? saved()?.text ?? ""
  const dirty = () => text() !== saved()?.text
  const bytes = createMemo(() => instructionsBytes(text()))
  const tooLong = () => bytes() > instructionsMaxBytes

  const save = async () => {
    if (!saved() || !dirty() || saving() || tooLong()) return
    setSaving(true)
    setFailed(false)
    const target = await options()
    const result = target && (await rpc.save({ text: text() }, target).catch(() => undefined))

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
            description={`${ctx.t("instructionsSkillHint")} ${ctx.t("instructionsCount", {
              used: bytes(),
              limit: instructionsMaxBytes,
            })}`}
            validationState={tooLong() ? "invalid" : "valid"}
            error={tooLong() ? ctx.t("instructionsLimitExceeded") : undefined}
            multiline
            class="min-h-40 max-h-80 overflow-y-auto"
            value={text()}
            disabled={saving()}
            onChange={setDraft}
          />
          <div class="flex flex-wrap items-center gap-3">
            <ctx.ui.Button variant="contrast" type="submit" disabled={!dirty() || saving() || tooLong()}>
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
