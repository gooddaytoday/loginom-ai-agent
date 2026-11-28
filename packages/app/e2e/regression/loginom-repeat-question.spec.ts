import type { FormAnswer, SessionMessageAssistant } from "@opencode/client/promise"
import type { ToolContext } from "@opencode/plugin/promise/tool"
import { Agent } from "@opencode/schema/agent"
import { Form } from "@opencode/schema/form"
import { Session } from "@opencode/schema/session"
import { SessionMessage } from "@opencode/schema/session-message"
import { Tool } from "@opencode/schema/tool"
import { timelinePresets } from "@opencode/session-ui/timeline/detail"
import { expect, test } from "@playwright/test"
import { Schema } from "effect"
import { repeatGuard } from "../../../loginom-agent/src/repeat-guard"
import { SERVER, sessionHref } from "../utils/app"
import { installSseTransport } from "../utils/sse-transport"
import { assistantMessage, toolPart, userMessage, userText } from "../utils/timeline"
import { expectSessionTitle } from "../utils/waits"
import { mockWorkspace } from "../utils/workspace"

const directory = "C:/OpenCode/Repeat"

const sessionID = Session.ID.make("ses_repeat_question")

const title = "Повтор вызова Loginom"

const tool = "loginom_dock_node_apply"

const summary = "Агент дважды вызвал применение настроек узла Loginom с теми же параметрами"

const hint = "Проверь только заголовок"

const decodeReply = Schema.decodeUnknownSync(Schema.Struct({ answer: Form.Answer }))

const scenarios: { width: number; newTimeline: boolean; answer: FormAnswer; button: string; calls: number }[] = [
  { width: 1280, newTimeline: false, answer: { decision: "continue" }, button: "Продолжить", calls: 3 },
  { width: 390, newTimeline: true, answer: { decision: "stop" }, button: "Остановить", calls: 2 },
  { width: 390, newTimeline: false, answer: { decision: "hint", hint }, button: "Отправить", calls: 2 },
]

for (const scenario of scenarios) {
  test(`repeat question: ${scenario.answer.decision} at ${scenario.width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width: scenario.width, height: 900 })
    const transport = await installSseTransport(page, { server: SERVER, retry: 20 })
    const input = { parameters: { filter: "2026" } }
    const user = userMessage([userText("Примени настройки узла к данным за 2026 год.")])
    const opened = Promise.withResolvers<Form.Info>()
    const reply = Promise.withResolvers<{ status: "answered"; answer: Form.Answer }>()
    let interrupted = false
    const calls: string[] = []

    const repeat = repeatGuard({
      ask: (form, call) => {
        opened.resolve({
          ...form,
          sessionID: call.sessionID,
          metadata: { ...form.metadata, tool: { messageID: call.messageID, id: call.id } },
        })

        return reply.promise
      },
      interrupt: async () => {
        interrupted = true
      },
    }).wrap({
      name: tool,
      description: "Apply node settings",
      input: {},
      execute: async (_, call) => {
        calls.push(call.id)

        return { content: "Настройки применены" }
      },
    })

    const call = (attempt: number, progress: ToolContext["progress"] = async () => {}): ToolContext => ({
      id: Tool.CallID.make(`call_repeat_${attempt}`),
      sessionID,
      agent: Agent.ID.make("build"),
      messageID: SessionMessage.ID.make(`msg_repeat_${attempt}`),
      signal: new AbortController().signal,
      progress,
    })

    const completed: SessionMessageAssistant[] = []

    for (const attempt of [1, 2]) {
      const ctx = call(attempt)
      const result = await repeat.execute(input, ctx)
      completed.push(
        assistantMessage(
          [toolPart(ctx.id, tool, "completed", input, { output: "Настройки применены", metadata: result.metadata })],
          { id: ctx.messageID, created: user.time.created + attempt * 1_000 },
        ),
      )
    }

    const third = call(3, async (metadata) => {
      await transport.send({
        id: "evt_repeat_tool_progress",
        created: user.time.created + 3_000,
        type: "session.tool.progress",
        location: { directory },
        data: { sessionID, assistantMessageID: third.messageID, id: third.id, metadata },
      })
    })

    const current = assistantMessage([toolPart(third.id, tool, "running", input)], {
      id: third.messageID,
      created: user.time.created + 3_000,
      completed: false,
    })

    const replies: unknown[] = []
    let pending: ReturnType<typeof wireForm> | undefined
    await mockWorkspace(page, {
      name: "Repeat",
      directory,
      sessions: [{ id: sessionID, title }],
      pageMessages: () => ({ items: [user, ...completed, current] }),
      sessionStatus: { [sessionID]: { type: "busy" } },
      forms: () => (pending && !replies.length ? [pending] : []),
      onFormReply: (request) => {
        replies.push(request)
        reply.resolve({ status: "answered", answer: decodeReply(request.body).answer })
      },
      seed: {
        locale: "ru",
        settings: { general: { newTimeline: scenario.newTimeline, timelineDetail: timelinePresets[2].value } },
      },
    })
    await page.goto(sessionHref(sessionID))
    await transport.waitForConnection()
    await expectSessionTitle(page, title)
    await expect(page.getByText(user.text)).toBeVisible()

    const row = page.locator('[data-component="tool-group-row"]')
    await expect(row).toHaveCount(0)

    const thirdResult = repeat.execute(input, third).catch((error) => {
      if (error instanceof Tool.Error) return error

      throw error
    })

    pending = wireForm(await opened.promise)
    const formID = pending.id
    expect(calls).toEqual(["call_repeat_1", "call_repeat_2"])
    await transport.send({
      id: "evt_repeat_form_created",
      created: user.time.created + 4_000,
      type: "form.created",
      location: { directory },
      data: { form: pending },
    })

    const dock = page.locator('[data-component="session-composer-dock"]')
    const question = dock.locator('[data-component="dock-prompt"][data-kind="question"]')
    await expect(question).toHaveCount(1)
    await expect(question.getByText(/Агент собирается в третий раз/)).toBeVisible()
    await expect(dock.locator('[data-component="composer"]')).toHaveCount(0)
    await expect(row).toHaveCount(1)
    await expect(row).toHaveText(summary)

    for (const id of calls) await expect(page.locator(`[data-timeline-part-id="${id}"]`)).toHaveCount(0)
    await expect(question.getByRole("button", { name: "Продолжить" })).toBeVisible()
    await expect(question.getByRole("button", { name: "Остановить" })).toBeVisible()

    const send = question.getByRole("button", { name: "Отправить" })
    await expect(send).toBeDisabled()

    if (scenario.answer.decision === "hint") {
      await question.getByRole("textbox", { name: "Подсказать агенту" }).fill(hint)
      await expect(send).toBeEnabled()
    }

    await page.screenshot({ path: info.outputPath(`repeat-question-${scenario.width}.png`) })
    await question.getByRole("button", { name: scenario.button }).dblclick()
    await expect.poll(() => replies).toEqual([{ sessionID, formID, body: { answer: scenario.answer } }])
    const result = await thirdResult
    expect(calls).toHaveLength(scenario.calls)
    expect(interrupted).toBe(scenario.answer.decision === "stop")

    if (scenario.answer.decision === "hint") expect(result).toBeInstanceOf(Tool.Error)

    if (scenario.answer.decision === "hint" && result instanceof Tool.Error) expect(result.message).toContain(hint)
    await transport.send({
      id: "evt_repeat_form_replied",
      created: user.time.created + 5_000,
      type: "form.replied",
      location: { directory },
      data: { id: formID, sessionID, answer: scenario.answer },
    })
    await expect(question).toHaveCount(0)
    await expect(row).toHaveCount(1)
  })
}

function wireForm(form: Form.Info) {
  const [head, ...rest] = form.fields

  const field = (value: Form.Field) => {
    if (value.type !== "string") throw new Error("Repeat form fields must be strings")

    return { ...value, options: value.options?.slice(), when: value.when?.slice() }
  }

  const fields: [ReturnType<typeof field>, ...ReturnType<typeof field>[]] = [field(head), ...rest.map(field)]

  return { ...form, fields }
}
