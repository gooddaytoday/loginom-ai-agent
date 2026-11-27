import { DockPrompt } from "@opencode/session-ui/dock-prompt"
import { Button } from "@opencode/ui/button"
import { TextInput } from "@opencode/ui/text-input"
import { createUniqueId } from "solid-js"

export function LoginomRepeatDock(props: {
  title: string
  message: string
  busy: boolean
  hint: string
  onHint: (text: string) => void
  onDecide: (decision: "continue" | "stop" | "hint") => void
}) {
  const hintID = createUniqueId()

  return (
    <DockPrompt
      kind="question"
      header={
        <>
          <div data-slot="question-header-top">
            <div data-slot="question-header-title">{props.title}</div>
          </div>
          <div data-slot="question-details">
            <div data-slot="question-text">{props.message}</div>
          </div>
        </>
      }
      footer={null}
    >
      <div class="flex flex-col gap-3 px-3 pb-3">
        <div class="flex flex-wrap gap-2">
          <Button variant="submit" size="large" disabled={props.busy} onClick={() => props.onDecide("continue")}>
            Продолжить
          </Button>
          <Button variant="neutral" size="large" disabled={props.busy} onClick={() => props.onDecide("stop")}>
            Остановить
          </Button>
        </div>
        <form
          class="flex flex-col gap-1"
          onSubmit={(event) => {
            event.preventDefault()

            if (!props.busy && props.hint.trim()) props.onDecide("hint")
          }}
        >
          <label class="text-12-medium" for={hintID}>
            Подсказать агенту
          </label>
          <div class="flex items-center gap-2">
            <TextInput
              id={hintID}
              class="min-w-0 flex-1"
              value={props.hint}
              disabled={props.busy}
              onInput={(event) => props.onHint(event.currentTarget.value)}
            />
            <Button type="submit" variant="neutral" size="large" disabled={props.busy || !props.hint.trim()}>
              Отправить
            </Button>
          </div>
        </form>
      </div>
    </DockPrompt>
  )
}
