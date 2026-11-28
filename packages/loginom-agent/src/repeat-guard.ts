import { isDeepStrictEqual } from "node:util"
import type { Info, ToolContext } from "@opencode/plugin/promise/tool"
import type { Question } from "@opencode/schema/question"
import { Tool } from "@opencode/schema/tool"
import { Schema } from "effect"

const Continue = "Продолжить"
const Stop = "Остановить"
const Hint = "Подсказать агенту"
const Stopped = "Остановлено: третий одинаковый вызов подряд. Не повторяй его с теми же параметрами."
const Answer = Schema.decodeUnknownOption(Schema.Struct({ answers: Schema.Array(Schema.Array(Schema.String)) }))

const stepNames = new Map([
  ["loginom_dock_action_run", "запускает операцию Loginom"],
  ["loginom_dock_artifact_deliver", "доставляет файл в Loginom"],
  ["loginom_dock_artifact_delivery_cancel", "отменяет доставку файла"],
  ["loginom_dock_artifact_delivery_resume", "возобновляет доставку файла"],
  ["loginom_dock_artifact_upload", "загружает файл в Loginom"],
  ["loginom_dock_browser_recovery", "управляет восстановлением в браузере"],
  ["loginom_dock_clipboard_transfer", "копирует и вставляет данные"],
  ["loginom_dock_node_apply", "применяет настройки узла Loginom"],
  ["loginom_dock_node_cancel", "отменяет операцию над узлом"],
  ["loginom_dock_node_delete", "удаляет узел Loginom"],
  ["loginom_dock_node_resume", "возобновляет операцию над узлом"],
  ["loginom_dock_node_stop", "останавливает выполнение узла"],
  ["loginom_dock_operation_recover", "восстанавливает операцию Loginom"],
  ["loginom_dock_ui_action", "выполняет действие в окне Loginom"],
  ["loginom_browser_click", "нажимает на элемент в окне Loginom"],
  ["loginom_browser_mouse_click_xy", "нажимает в окне Loginom"],
  ["loginom_browser_drag", "перетаскивает элемент в окне Loginom"],
  ["loginom_browser_mouse_drag_xy", "перетаскивает элемент в окне Loginom"],
  ["loginom_browser_type", "вводит текст в окне Loginom"],
  ["loginom_browser_press_key", "нажимает клавишу в окне Loginom"],
  ["loginom_browser_fill_form", "заполняет форму в окне Loginom"],
  ["loginom_browser_select_option", "выбирает значение в окне Loginom"],
  ["loginom_browser_handle_dialog", "отвечает на диалог Loginom"],
  ["loginom_file_admit", "регистрирует файл для доставки в Loginom"],
])

async function ask(question: Info, call: ToolContext, prompt: Question.Prompt) {
  const result = await question.execute({ questions: [prompt] }, call).catch((error: unknown) => {
    call.signal.throwIfAborted()
    if (
      error instanceof Tool.Error &&
      error.message.startsWith("This non-interactive run cannot ask the user questions")
    )
      throw new Tool.Error({ message: Stopped })
    throw error
  })
  call.signal.throwIfAborted()
  const output = Answer(result.output)
  return output._tag === "Some" ? output.value.answers[0]?.[0] : undefined
}

export function repeatGuard(getQuestion: () => Promise<Info | undefined>) {
  const pending = new Map<string, { tool: string; input: unknown; count: number; asking: boolean }>()

  return {
    tracks: (name: string) => stepNames.has(name),
    reset: (sessionID: string) => pending.delete(sessionID),
    wrap(tool: Info): Info {
      const name = tool.name
      const step = stepNames.get(name)
      if (!step) return tool
      return {
        ...tool,
        execute: async (input, call) => {
          const current = pending.get(call.sessionID)
          if (current?.tool !== name || !isDeepStrictEqual(current.input, input)) {
            pending.set(call.sessionID, { tool: name, input: structuredClone(input), count: 1, asking: false })
          } else if (++current.count >= 3) {
            if (current.asking) throw new Tool.Error({ message: "Повторный вызов уже ждёт ответа пользователя." })
            current.asking = true
            try {
              const question = await getQuestion()
              if (!question) throw new Tool.Error({ message: "Повтор остановлен: вопрос пользователю недоступен." })
              call.signal.throwIfAborted()
              const answer = await ask(question, call, {
                header: "Повтор действия",
                question: `Агент снова делает одно и то же: ${step}`,
                options: [
                  { label: Continue, description: "Выполнить действие ещё раз" },
                  { label: Stop, description: "Не выполнять повторное действие" },
                  { label: Hint, description: "Указать агенту, что сделать вместо повтора" },
                ],
              })
              // Continue runs this call and resets the count; the next identical call starts a new streak.
              // Stop or a hint rejects this call without resetting the count, so an identical retry asks again.
              if (answer === Continue) current.count = 0
              else {
                const hint =
                  answer === Hint
                    ? await ask(question, call, {
                        header: Hint,
                        question: "Что сделать вместо повторного действия?",
                        options: [],
                      })
                    : answer === Stop
                      ? undefined
                      : answer
                const stopped = "Пользователь остановил повторный вызов. Не повторяй его с теми же параметрами."
                throw new Tool.Error({ message: hint ? `${stopped}\nПодсказка пользователя: ${hint}` : stopped })
              }
            } finally {
              current.asking = false
            }
          }
          return tool.execute(input, call)
        },
      }
    },
  }
}
