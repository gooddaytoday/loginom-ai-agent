import { randomUUID } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import type { Info, ToolContext, ToolDomain } from "@opencode/plugin/promise/tool"
import { Form } from "@opencode/schema/form"
import { Tool } from "@opencode/schema/tool"
import { isRecord } from "@opencode/util/record"

const stopped = "Остановлено: третий одинаковый вызов подряд. Не повторяй его с теми же параметрами."

const stepNames = new Map([
  ["loginom_dock_action_run", "запуск операции Loginom"],
  ["loginom_dock_artifact_deliver", "доставку файла в Loginom"],
  ["loginom_dock_artifact_delivery_cancel", "отмену доставки файла"],
  ["loginom_dock_artifact_delivery_resume", "возобновление доставки файла"],
  ["loginom_dock_artifact_upload", "загрузку файла в Loginom"],
  ["loginom_dock_browser_recovery", "восстановление в браузере"],
  ["loginom_dock_clipboard_transfer", "копирование и вставку данных"],
  ["loginom_dock_node_apply", "применение настроек узла Loginom"],
  ["loginom_dock_node_cancel", "отмену операции над узлом"],
  ["loginom_dock_node_delete", "удаление узла Loginom"],
  ["loginom_dock_node_resume", "возобновление операции над узлом"],
  ["loginom_dock_node_stop", "остановку выполнения узла"],
  ["loginom_dock_operation_recover", "восстановление операции Loginom"],
  ["loginom_dock_ui_action", "действие в окне Loginom"],
  ["loginom_browser_click", "нажатие на элемент в окне Loginom"],
  ["loginom_browser_mouse_click_xy", "нажатие в окне Loginom"],
  ["loginom_browser_drag", "перетаскивание элемента в окне Loginom"],
  ["loginom_browser_mouse_drag_xy", "перетаскивание в окне Loginom"],
  ["loginom_browser_type", "ввод текста в окне Loginom"],
  ["loginom_browser_press_key", "нажатие клавиши в окне Loginom"],
  ["loginom_browser_fill_form", "заполнение формы в окне Loginom"],
  ["loginom_browser_select_option", "выбор значения в окне Loginom"],
  ["loginom_browser_handle_dialog", "ответ на диалог Loginom"],
  ["loginom_file_admit", "регистрацию файла для доставки в Loginom"],
])

// These tools take a new request identity. For recovery, resume, cancel and stop, operation_id names the target.
const newOperation = new Set([
  "loginom_dock_action_run",
  "loginom_dock_artifact_deliver",
  "loginom_dock_artifact_upload",
  "loginom_dock_node_apply",
  "loginom_dock_node_delete",
  "loginom_dock_ui_action",
])

function comparable(name: string, input: unknown) {
  if (!isRecord(input)) return input
  return Object.fromEntries(
    Object.entries(input).filter(
      ([key]) =>
        key !== "host_context_token" &&
        !(key === "operation_id" && newOperation.has(name)) &&
        !(key === "recovery_operation_id" && name === "loginom_dock_operation_recover"),
    ),
  )
}

interface Streak {
  id: string
  name: string
  input: unknown
  messageID: ToolContext["messageID"]
  count: number
  inFlight: boolean
  parallel: boolean
  declined?: Form.ID
}

export function repeatGuard(options: {
  ask: ToolDomain["ask"]
  interrupt: (sessionID: ToolContext["sessionID"]) => Promise<unknown>
}) {
  const recent = new Map<string, Streak>()
  const waiting = new Map<string, { streak: Streak; formID: Form.ID }>()

  return {
    before: (sessionID: string, tool: string) => {
      if (recent.get(sessionID)?.name !== tool) recent.delete(sessionID)
    },
    reset: (sessionID: string) => recent.delete(sessionID),
    wrap(tool: Info): Info {
      const name = tool.name
      const action = stepNames.get(name)
      if (!action) return tool

      return {
        ...tool,
        async execute(input, call) {
          const session = call.sessionID
          const args = comparable(name, input)
          const matches = (group: Streak) => group.name === name && isDeepStrictEqual(group.input, args)
          const member = (group: Streak, formID?: Form.ID) => ({
            timelineGroup: { id: group.id, attempt: group.count, ...(formID && { formID }) },
          })
          const decision = waiting.get(session)
          if (decision) {
            const same = matches(decision.streak)
            if (same) decision.streak.count++
            throw new Tool.Error({
              message: "Повторный вызов уже обрабатывается.",
              ...(same && { metadata: member(decision.streak, decision.formID) }),
            })
          }

          const previous = recent.get(session)
          if (previous?.declined && matches(previous)) {
            previous.count++
            throw new Tool.Error({ message: stopped, metadata: member(previous, previous.declined) })
          }

          const parallel = !!previous && (previous.inFlight || previous.messageID === call.messageID)
          const streak =
            previous && !parallel && !previous.parallel && matches(previous)
              ? previous
              : {
                  id: randomUUID(),
                  name,
                  input: structuredClone(args),
                  count: 0,
                  parallel,
                  inFlight: false,
                  messageID: call.messageID,
                }
          streak.messageID = call.messageID
          streak.count++
          streak.inFlight = true
          recent.set(session, streak)

          let metadata: Tool.Metadata = member(streak)
          try {
            if (streak.count === 3) {
              const signal = call.signal
              signal.throwIfAborted()
              const formID = Form.ID.create()
              const group = {
                ...member(streak, formID).timelineGroup,
                summary: `Агент дважды вызвал ${action} с теми же параметрами`,
              }
              metadata = { timelineGroup: group }
              waiting.set(session, { streak, formID })
              await call.progress(metadata)
              const reply = await options.ask(
                {
                  id: formID,
                  title: "Повтор действия",
                  metadata: {
                    kind: "question",
                    loginomRepeat: true,
                    timelineGroup: group,
                    message: `Агент собирается в третий раз вызвать ${action} с теми же параметрами.`,
                  },
                  fields: [
                    {
                      key: "decision",
                      type: "string",
                      required: true,
                      options: [
                        { value: "continue", label: "Продолжить" },
                        { value: "stop", label: "Остановить" },
                        { value: "hint", label: "Подсказать агенту" },
                      ],
                    },
                    {
                      key: "hint",
                      type: "string",
                      required: true,
                      pattern: "\\S",
                      title: "Подсказать агенту",
                      when: [{ key: "decision", op: "eq", value: "hint" }],
                    },
                  ],
                },
                call,
                signal,
              )
              signal.throwIfAborted()

              if (reply.status === "cancelled") {
                streak.declined = formID
                if (reply.message === undefined) await options.interrupt(session)
                throw new Tool.Error({ message: stopped })
              }
              if (reply.answer.decision === "stop") {
                await options.interrupt(session)
                throw new Tool.Error({ message: stopped })
              }
              if (reply.answer.decision !== "continue") {
                streak.declined = formID
                const hint = reply.answer.hint
                throw new Tool.Error({
                  message: typeof hint === "string" ? `${stopped}\nПодсказка пользователя: ${hint}` : stopped,
                })
              }
              if (recent.get(session) === streak) recent.delete(session)
            }

            if (streak.count < 3) await call.progress(metadata)
            const result = await tool.execute(input, {
              sessionID: call.sessionID,
              messageID: call.messageID,
              id: call.id,
              agent: call.agent,
              get signal() {
                return call.signal
              },
              progress: (update) => call.progress({ ...update, ...metadata }),
            })
            return { ...result, metadata: { ...result.metadata, ...metadata } }
          } catch (error) {
            if (error instanceof Tool.Error)
              throw new Tool.Error({
                message: error.message,
                error: error.error,
                metadata: { ...error.metadata, ...metadata },
              })
            throw error
          } finally {
            if (waiting.get(session)?.streak === streak) waiting.delete(session)
            streak.inFlight = false
          }
        },
      }
    },
  }
}
