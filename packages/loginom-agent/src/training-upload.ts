import type { Plugin } from "@opencode/plugin"
import type { ToolContext } from "@opencode/plugin/promise/tool"
import { Tool } from "@opencode/schema/tool"
import { Schema } from "effect"
import type { ServiceHost } from "./host"

const allow = "Передать"
const answer = Schema.is(Schema.Struct({ answers: Schema.Tuple([Schema.Tuple([Schema.Literal(allow)])]) }))

export function trainingUploadConsent(plugin: Pick<Plugin.Context, "storage" | "tool">) {
  const pending = new Map<string, Promise<boolean>>()
  return async (
    call: ToolContext,
    host: Pick<ServiceHost.Lease, "uploadTarget">,
    name: string,
  ): Promise<number | undefined | false> => {
    const target = await host.uploadTarget()
    call.signal.throwIfAborted()
    if (!target.training) return
    const key = `training-upload-consent:${call.sessionID}`
    const current = pending.get(key) ?? ask(key, name, call).finally(() => pending.delete(key))
    pending.set(key, current)
    const approved = await current
    call.signal.throwIfAborted()
    return approved ? target.generation : false
  }

  async function ask(key: string, name: string, call: ToolContext) {
    if ((await plugin.storage.get(key)) === true) return true
    call.signal.throwIfAborted()
    const question = (await plugin.tool.list()).find((tool) => tool.id === "question")
    if (!question) throw new Tool.Error({ message: "LOGINOM_TRAINING_UPLOAD_CONSENT_REQUIRED: форма вопроса недоступна." })
    const reply = await question
      .execute(
        {
          questions: [
            {
              header: "Учебный сервер",
              question: `Передать файл «${name}» на учебный сервер Loginom в интернете?`,
              options: [
                { label: allow, description: "Разрешить передачу файлов на учебный сервер в этом разговоре." },
                { label: "Не передавать", description: "Оставить файл на компьютере." },
              ],
            },
          ],
        },
        call,
      )
      .catch((error: unknown) => {
        call.signal.throwIfAborted()
        if (error instanceof Error && "_tag" in error && error._tag === "QuestionTool.CancelledError") return
        throw error
      })
    call.signal.throwIfAborted()
    if (!answer(reply?.output)) return false
    await plugin.storage.set(key, true)
    return true
  }
}

export function trainingUploadDeclined() {
  return new Tool.Error({
    message:
      "LOGINOM_TRAINING_UPLOAD_DECLINED: пользователь не дал согласие на передачу файла на учебный сервер Loginom. " +
      "Файл не загружен. Сообщите об этом и продолжайте без загрузки. Повторите запрос только по просьбе пользователя.",
  })
}
