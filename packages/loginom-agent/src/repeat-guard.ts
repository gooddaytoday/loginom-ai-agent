import { isDeepStrictEqual } from "node:util"
import type { Info, ToolContext, ToolEditor } from "@opencode/plugin/promise/tool"
import type { Question } from "@opencode/schema/question"
import { Tool } from "@opencode/schema/tool"
import { Schema } from "effect"

const Continue = "Продолжить"
const Stop = "Остановить"
const Hint = "Подсказать агенту"
const Answer = Schema.decodeUnknownOption(Schema.Struct({ answers: Schema.Array(Schema.Array(Schema.String)) }))

const stepNames: Readonly<Record<string, string>> = {
  loginom_find: "ищет в справке Loginom",
  loginom_search: "ищет в справке Loginom",
  loginom_read: "читает справку Loginom",
  loginom_grep: "ищет текст в справке Loginom",
  loginom_glob: "ищет файлы справки Loginom",
  loginom_list: "просматривает список файлов справки Loginom",
  loginom_tree: "просматривает разделы справки Loginom",
  loginom_dock_diagnostics: "проверяет подключение к Loginom",
  loginom_dock_prepare: "готовит пакет Loginom к работе",
  loginom_dock_node_apply: "применяет настройки узла Loginom",
  loginom_dock_action_describe: "запрашивает описание операции Loginom",
  loginom_dock_action_run: "запускает операцию Loginom",
  loginom_file_admit: "регистрирует файл с данными",
  loginom_file_profile: "определяет структуру файла с данными",
  loginom_file_scan: "проверяет файл с данными",
  loginom_file_sample: "делает выборку из файла с данными",
}

async function ask(question: Info, call: ToolContext, prompt: Question.Prompt) {
  const result = await question.execute({ questions: [prompt] }, call)
  call.signal.throwIfAborted()
  const output = Answer(result.output)
  return output._tag === "Some" ? output.value.answers[0]?.[0] : undefined
}

export function repeatGuard() {
  const pending = new Map<string, { tool: string; input: unknown; count: number; asking: boolean }>()

  return {
    reset: (sessionID: string) => pending.delete(sessionID),
    wrap(editor: ToolEditor) {
      const question = editor.get("question")
      for (const { id } of editor.list()) {
        if (!id.startsWith("loginom_")) continue
        editor.update(id, (tool) => {
          const execute = tool.execute
          tool.execute = async (input, call) => {
            const current = pending.get(call.sessionID)
            if (current?.tool !== id || !isDeepStrictEqual(current.input, input)) {
              pending.set(call.sessionID, { tool: id, input: structuredClone(input), count: 1, asking: false })
            } else if (++current.count >= 3) {
              if (current.asking) throw new Tool.Error({ message: "Повторный вызов уже ждёт ответа пользователя." })
              if (!question) throw new Tool.Error({ message: "Повтор остановлен: вопрос пользователю недоступен." })
              const stopped = "Пользователь остановил повторный вызов. Не повторяй его с теми же параметрами."
              current.asking = true
              try {
                const answer = await ask(question, call, {
                  header: "Повтор действия",
                  question: `Агент третий раз подряд делает одно и то же: ${stepNames[id] ?? "выполняет операцию в Loginom"}`,
                  options: [
                    { label: Continue, description: "Выполнить действие ещё раз" },
                    { label: Stop, description: "Не выполнять повторное действие" },
                    { label: Hint, description: "Указать агенту, что сделать вместо повтора" },
                  ],
                })
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
                  throw new Tool.Error({ message: hint ? `${stopped}\nПодсказка пользователя: ${hint}` : stopped })
                }
              } finally {
                current.asking = false
              }
            }
            return execute(input, call)
          }
        })
      }
    },
  }
}
