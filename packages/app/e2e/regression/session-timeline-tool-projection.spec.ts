import { expect, test } from "@playwright/test"
import type { SessionMessageInfo } from "@opencode/client/promise"
import { Schema } from "effect"
import { timelinePresets } from "@opencode/session-ui/timeline/detail"
import {
  assistantMessage,
  partUpdated,
  sessionID,
  setupTimeline,
  textPart,
  toolPart,
  userMessage,
} from "../utils/timeline"

test("keeps shell and question failures in their Used group", async ({ page }) => {
  const shellID = "prt_transition_error_shell"
  const questionID = "prt_transition_error_question"

  const timeline = await setupTimeline(page, {
    settings: { timelineDetail: timelinePresets[2].value },
    messages: [
      userMessage(),
      assistantMessage(
        [
          toolPart(shellID, "shell", "streaming", { command: "exit 1" }),
          toolPart(questionID, "question", "streaming", questionInput()),
        ],
        { completed: false },
      ),
    ],
  })

  const group = page.locator('[data-component="collapsed-tool-group"]')
  const used = group.locator(':scope > [data-component="collapsible"] > [data-slot="collapsible-trigger"]')
  await used.click()
  await expect(page.locator(`[data-timeline-part-id="${questionID}"]`)).toHaveCount(0)
  await timeline.send(partUpdated(toolPart(shellID, "shell", "running", { command: "exit 1" })))
  await expect(page.locator(`[data-timeline-part-id="${shellID}"]`)).toContainText("exit 1")
  await timeline.send(partUpdated(toolPart(questionID, "question", "running", questionInput())))
  await expect(page.locator(`[data-timeline-part-id="${questionID}"]`)).toHaveCount(0)
  await timeline.send(
    partUpdated(
      toolPart(
        shellID,
        "shell",
        "completed",
        { command: "exit 1" },
        { output: "Command exited 1", metadata: { exit: 1 } },
      ),
    ),
  )
  await timeline.send(
    partUpdated(
      toolPart(questionID, "question", "error", questionInput(), { error: "The user dismissed this question" }),
    ),
  )

  await expect(group).toHaveAttribute("data-timeline-part-ids", `${shellID},${questionID}`)
  await expect(used).toHaveAttribute("aria-expanded", "true")
  const shell = group.locator(`[data-timeline-part-id="${shellID}"]`)
  await expect(shell.locator('[data-slot="collapsible-trigger"]')).toHaveAttribute("aria-expanded", "false")
  await shell.locator('[data-slot="collapsible-trigger"]').click()
  await expect(shell).toContainText("Command exited 1")
  const question = group.locator(`[data-timeline-part-id="${questionID}"]`)
  await expect(question).toContainText(/dismissed/i)
})

test("keeps rendering when a plugin tool reports progress metadata that is not an object", async ({ page }) => {
  const toolID = "prt_plugin_progress"
  const input = { prompt: "a cat" }

  const timeline = await setupTimeline(page, {
    messages: [
      userMessage(),
      assistantMessage([toolPart(toolID, "plugin_imagegen", "running", input)], { completed: false }),
    ],
  })

  await page
    .locator(
      '[data-component="collapsed-tool-group"] > [data-component="collapsible"] > [data-slot="collapsible-trigger"]',
    )
    .click()
  await timeline.waitForPart(toolID)

  const progress = partUpdated(
    toolPart(toolID, "plugin_imagegen", "running", input, { metadata: { status: "x" } }),
  ).find((event) => event.type === "session.tool.progress")!

  // Plugin tools are untyped at runtime, and the server forwards progress metadata as sent, so the
  // frame is written raw to skip the harness's event validation.
  await timeline.transport.writeRaw(
    `data: ${JSON.stringify({ ...progress, data: { ...progress.data, metadata: "polling" } })}\n\n`,
  )
  await timeline.send(partUpdated(textPart("prt_plugin_progress_text", "Still polling the image task.")))

  await expect(page.getByText("Still polling the image task.")).toBeVisible()
  await expect(page.locator(`[data-timeline-part-id="${toolID}"]`)).toBeVisible()
  await expect(page.getByRole("heading", { name: "Something went wrong" })).toHaveCount(0)
})

function questionInput() {
  return { questions: [{ header: "Stability", question: "Keep it stable?", options: [] }] }
}

const readTool = "loginom_dock_workspace_observe"

const writeTool = "loginom_dock_node_apply"

const writeID = "690a1e49-9c4a-4dc9-a943-c0eaa1acb507"

const decodeRetry = Schema.decodeUnknownSync(
  Schema.Struct({
    text: Schema.String,
    metadata: Schema.Struct({
      displayText: Schema.String,
      comments: Schema.Array(Schema.String),
      attachments: Schema.Array(Schema.String),
    }),
  }),
)

const connection = (ready: boolean) => ({
  ok: true,
  value: {
    revision: 1,
    generation: ready ? 2 : 1,
    state: ready ? "ready" : "starting",
    failed: false,
    url: "https://loginom.test/",
    username: "operator",
    folder: "/user",
    hasPassword: true,
  },
})

test("Loginom: a second read failure offers retry and safe error copying", async ({ page, context }) => {
  const secret = "Bearer must-not-copy /private/example.lgp password=do-not-copy"

  const history: SessionMessageInfo[] = [
    userMessage(),
    assistantMessage([
      toolPart("prt_loginom_read_first", readTool, "error", {}, { error: secret }),
      toolPart("prt_loginom_read_second", readTool, "error", {}, { error: secret }),
    ]),
  ]

  let retries = 0
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await setupTimeline(page, {
    locale: "ru",
    viewport: { width: 1280, height: 860 },
    tabs: [sessionID],
    pageMessages: () => ({ items: history }),
    pluginRpc: (rpc, method) => (rpc === "loginom.connection" && method === "status" ? connection(true) : undefined),
    onPrompt({ body }) {
      retries++
      const prompt = decodeRetry(body)
      expect(prompt.text).toContain(readTool)
      expect(prompt.metadata.displayText).toBe("Вы повторили шаг")
      const retryMessage = userMessage([], { id: "msg_loginom_retry", created: 1700000004000 })
      retryMessage.text = prompt.text
      retryMessage.metadata = { displayText: prompt.metadata.displayText, comments: [], attachments: [] }
      history.push(
        retryMessage,
        assistantMessage(
          [toolPart("prt_loginom_read_success", readTool, "completed", {}, { output: "Read succeeded" })],
          { id: "msg_loginom_retried", parentID: retryMessage.id, created: 1700000005000 },
        ),
      )
    },
  })

  const block = page.locator("section").filter({ has: page.getByRole("heading", { name: "Шаг не выполнен" }) })
  const retry = block.getByRole("button", { name: "Повторить шаг" })
  await expect(retry).toBeEnabled()
  await expect(retry).toBeInViewport()
  await expect(
    page.locator("[data-titlebar-tab]:visible").getByRole("img", { name: "Шаг Loginom требует внимания" }),
  ).toBeVisible()
  await block.getByRole("button", { name: "Скопировать текст ошибки" }).click()
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("LOGINOM_READ_FAILED: Loginom не завершил чтение после двух попыток.")
  await page.screenshot({ path: test.info().outputPath("step-failed-1280.png"), animations: "disabled" })

  const response = page.waitForResponse(
    (candidate) => new URL(candidate.url()).pathname === `/api/session/${sessionID}/prompt`,
  )

  await retry.click()
  expect((await response).ok()).toBe(true)
  expect(retries).toBe(1)
  await page.reload()
  await expect(page.getByText("Вы повторили шаг", { exact: true })).toBeVisible()
  await expect(block).toHaveCount(0)
})

test("Loginom: a checked write still waits for the operation's retry permission", async ({ page }) => {
  await setupTimeline(page, {
    locale: "ru",
    messages: [
      userMessage(),
      assistantMessage([
        toolPart(
          "prt_loginom_operation",
          writeTool,
          "error",
          {},
          {
            metadata: {
              loginom: {
                v: 1,
                operationId: "operation-1",
                state: "settled",
                step: {
                  outcome: "check_required",
                  retryAvailable: false,
                  persistence: "unknown",
                  save: null,
                },
              },
              writeID,
            },
          },
        ),
      ]),
    ],
    pluginRpc(rpc, method, input) {
      if (rpc === "loginom.connection" && method === "status") return connection(true)

      if (rpc === "loginom.write-outcome" && method === "check") {
        expect(input).toEqual({ sessionID, writeID })

        return { status: "not_applied", writeID }
      }

      if (rpc !== "loginom.step" || method !== "checkState") return
      expect(input).toEqual({ sessionID, operationId: "operation-1" })

      return {
        state: "observed",
        retryAvailable: false,
        window: { path: "/user/copy.lgp", modified: true, nodeCount: 1, linkCount: 0 },
        lastConfirmedStep: null,
        graphSinceLastConfirmedStep: "same",
        step: { outcome: "not_applied", retryAvailable: true, persistence: "step_unsaved", save: null },
      }
    },
  })
  await page.getByRole("button", { name: "Проверить состояние", exact: true }).click()
  await expect(page.getByText("Изменения шага не сохранены.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Повторить шаг" })).toBeDisabled()
})

for (const outcome of ["applied", "not_applied", "unknown"] as const) {
  test(`Loginom: reconnect does not clear an uncertain write (${outcome})`, async ({ page }) => {
    let ready = false
    let checks = 0
    let prompts = 0
    await setupTimeline(page, {
      locale: "ru",
      viewport: { width: 390, height: 844 },
      messages: [
        userMessage(),
        assistantMessage([
          toolPart(
            "prt_loginom_uncertain",
            writeTool,
            "error",
            {},
            {
              error: "LOGINOM_CALL_UNCERTAIN",
              metadata: {
                writeID,
                loginom: {
                  v: 1,
                  operationId: "write-2",
                  state: "settled",
                  step: {
                    outcome: "check_required",
                    retryAvailable: false,
                    reason: "unknown_write",
                    persistence: "unknown",
                    save: {
                      operationId: "save-1",
                      path: "/user/copy.lgp",
                      throughStep: { operationId: "read-1", label: "Импорт данных" },
                    },
                  },
                },
              },
            },
          ),
        ]),
      ],
      pluginRpc(rpc, method, input) {
        if (rpc === "loginom.connection" && method === "status") return connection(ready)

        if (rpc === "loginom.step" && method === "checkState" && outcome === "not_applied") {
          expect(input).toEqual({ sessionID, operationId: "write-2" })

          return {
            state: "observed",
            retryAvailable: true,
            step: { outcome: "not_applied", retryAvailable: true, persistence: "step_unsaved", save: null },
          }
        }

        if (rpc !== "loginom.write-outcome" || method !== "check") return
        checks++
        expect(input).toEqual({ sessionID, writeID })

        return { status: outcome, writeID, readback: outcome === "unknown" ? "unavailable" : "observed" }
      },
      onPrompt: () => void prompts++,
    })

    const heading = page.getByRole("heading", { name: "Нужно проверить состояние" })
    const check = page.getByRole("button", { name: "Проверить состояние", exact: true })
    const retry = page.getByRole("button", { name: "Повторить шаг", exact: true })
    await expect(heading).toBeVisible()
    await expect(page.getByText("Loginom пока не готов.")).toBeVisible()
    await expect(check).toBeDisabled()
    await expect(retry).toBeDisabled()
    await expect(page.getByText("Сохранено до шага «Импорт данных».")).toBeVisible()
    ready = true
    await expect(check).toBeEnabled()
    await expect(retry).toBeDisabled()
    expect(checks).toBe(0)

    if (outcome === "unknown") {
      await expect(check).toBeInViewport()
      await page.screenshot({ path: test.info().outputPath("step-check-required-390.png"), animations: "disabled" })
    }

    await check.click()

    if (outcome === "applied") {
      await expect(page.getByRole("heading", { name: "Шаг применён" })).toBeVisible()
      await expect(retry).toHaveCount(0)
    } else if (outcome === "not_applied") {
      await expect(page.getByText("Проверка показала: шаг не применён.")).toBeVisible()
      await expect(retry).toBeEnabled()
    } else {
      await expect(page.getByText("Проверка не подтвердила исход. Пока не повторяйте шаг.")).toBeVisible()
      await expect(retry).toBeDisabled()
    }

    expect(checks).toBe(1)
    expect(prompts).toBe(0)
  })
}
