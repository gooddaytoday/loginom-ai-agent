import { Option, Schema } from "effect"
import type { QuestionRendererProps } from "@opencode/plugin/gui/builtin"
import { DockPrompt } from "@opencode/session-ui/dock-prompt"
import { Button } from "@opencode/ui/button"
import { TextInput } from "@opencode/ui/text-input"
import { createUniqueId } from "solid-js"

const decodeMessage = Schema.decodeUnknownOption(Schema.String)

export function LoginomRepeatDock(props: QuestionRendererProps) {
  const hintID = createUniqueId()

  return (
    <DockPrompt
      kind="question"
      header={
        <>
          <div data-slot="question-header-top">
            <div data-slot="question-header-title">{props.request.title}</div>
          </div>
          <div data-slot="question-details">
            <div data-slot="question-text">
              {Option.getOrElse(decodeMessage(props.request.metadata?.message), () => "")}
            </div>
          </div>
        </>
      }
      footer={null}
    >
      <div class="flex flex-col gap-3 px-3 pb-3">
        <div class="flex flex-wrap gap-2">
          <Button
            variant="submit"
            size="large"
            disabled={props.busy}
            onClick={() => props.reply({ decision: "continue" })}
          >
            Продолжить
          </Button>
          <Button
            variant="neutral"
            size="large"
            disabled={props.busy}
            onClick={() => props.reply({ decision: "stop" })}
          >
            Остановить
          </Button>
        </div>
        <form
          class="flex flex-col gap-1"
          onSubmit={(event) => {
            event.preventDefault()

            const hint = props.draft.trim()

            if (!props.busy && hint) props.reply({ decision: "hint", hint })
          }}
        >
          <label class="text-12-medium" for={hintID}>
            Подсказать агенту
          </label>
          <div class="flex items-center gap-2">
            <TextInput
              id={hintID}
              class="min-w-0 flex-1"
              value={props.draft}
              disabled={props.busy}
              onInput={(event) => props.setDraft(event.currentTarget.value)}
            />
            <Button type="submit" variant="neutral" size="large" disabled={props.busy || !props.draft.trim()}>
              Отправить
            </Button>
          </div>
        </form>
      </div>
    </DockPrompt>
  )
}
