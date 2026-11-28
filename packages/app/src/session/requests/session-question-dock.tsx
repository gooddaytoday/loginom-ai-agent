import { createMemo, Show } from "solid-js"
import type { FormInfo } from "@opencode/client/promise"
import { QuestionRenderer } from "@opencode/plugin/gui/builtin"
import { useServerSDK } from "@/runtime/server/client"
import { useLanguage } from "@/runtime/i18n/language"
import { useOptionalPluginHost } from "@/runtime/plugin/host"
import { Contribution } from "@/runtime/plugin/render"
import { useSettings } from "@/settings/model"
import { createQuestionDock } from "./question-controller"
import { SessionQuestionDockClassic } from "./session-question-dock-classic"
import { SessionQuestionDockExperimental } from "./session-question-dock-experimental"

type Props = { request: FormInfo; onSubmit: () => void }

export function SessionQuestionDock(props: Props) {
  const settings = useSettings()
  const host = useOptionalPluginHost()
  const renderer = createMemo(() => host?.items(QuestionRenderer).find(({ value }) => value.matches(props.request)))

  const fallback = () => (
    <Show when={settings.general.newQuestionUI()} fallback={<SessionQuestionDockClassic {...props} />}>
      <SessionQuestionDockExperimental {...props} />
    </Show>
  )

  return (
    <Show when={renderer()} keyed fallback={fallback()}>
      {(entry) => (
        <Contribution plugin={entry.plugin} fallback={fallback}>
          {() => <PluginQuestionDock {...props} renderer={entry.value} />}
        </Contribution>
      )}
    </Show>
  )
}

function PluginQuestionDock(props: Props & { renderer: QuestionRenderer }) {
  const form = createQuestionDock({
    sdk: useServerSDK(),
    language: useLanguage(),
    request: () => props.request,
    onSubmit: props.onSubmit,
  })

  return props.renderer.render({
    get request() {
      return props.request
    },
    get busy() {
      return form.busy()
    },
    get draft() {
      return form.draft(0).customText
    },
    setDraft: form.input,
    reply: form.reply,
  })
}
