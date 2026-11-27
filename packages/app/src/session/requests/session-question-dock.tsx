import { Option, Schema } from "effect"
import { Match, Switch } from "solid-js"
import type { FormInfo } from "@opencode/client/promise"
import { LoginomRepeatDock } from "@opencode/gui-plugins/loginom/repeat-dock"
import { useServerSDK } from "@/runtime/server/client"
import { useLanguage } from "@/runtime/i18n/language"
import { createQuestionDock } from "./question-controller"
import { useSettings } from "@/settings/model"
import { SessionQuestionDockClassic } from "./session-question-dock-classic"
import { SessionQuestionDockExperimental } from "./session-question-dock-experimental"

const decodeMessage = Schema.decodeUnknownOption(Schema.String)

type Props = { request: FormInfo; onSubmit: () => void }

export function SessionQuestionDock(props: Props) {
  const settings = useSettings()

  return (
    <Switch fallback={<SessionQuestionDockClassic {...props} />}>
      <Match when={props.request.metadata?.loginomRepeat === true}>
        <RepeatQuestionDock {...props} />
      </Match>
      <Match when={settings.general.newQuestionUI()}>
        <SessionQuestionDockExperimental {...props} />
      </Match>
    </Switch>
  )
}

function RepeatQuestionDock(props: Props) {
  const form = createQuestionDock({
    sdk: useServerSDK(),
    language: useLanguage(),
    request: () => props.request,
    onSubmit: props.onSubmit,
  })

  return (
    <LoginomRepeatDock
      title={props.request.title}
      message={Option.getOrElse(decodeMessage(props.request.metadata?.message), () => "")}
      busy={form.busy()}
      hint={form.draft(0).customText}
      onHint={form.input}
      onDecide={(decision) => {
        if (decision === "hint") {
          const hint = form.draft(0).customText.trim()

          if (hint) form.reply({ decision, hint })
        } else {
          form.reply({ decision })
        }
      }}
    />
  )
}
