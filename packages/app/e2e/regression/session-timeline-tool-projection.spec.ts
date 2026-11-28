import { expect, test } from "@playwright/test"
import type { JsonValue, SessionMessageInfo } from "@opencode/client/promise"
import { Schema } from "effect"
import { timelinePresets } from "@opencode/session-ui/timeline/detail"
import {
  assistantMessage,
  partUpdated,
  sessionID,
  setupTimeline,
  status,
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

const readTool = "loginom_dock_node_read"

const writeTool = "loginom_dock_node_apply"

const decodeRetry = Schema.decodeUnknownSync(
  Schema.Struct({
    id: Schema.String,
    text: Schema.String,
    metadata: Schema.Struct({
      displayText: Schema.String,
      loginomRetry: Schema.String,
      comments: Schema.mutable(Schema.Array(Schema.String)),
      attachments: Schema.mutable(Schema.Array(Schema.String)),
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

test("Loginom: a retry with a new operation ID needs a matching terminal receipt", async ({ page, context }) => {
  const secret = "Bearer must-not-copy /private/example.lgp password=do-not-copy"
  const input = { source_operation_id: "configure-orders", execution: "existing", read: { ports: [0] } }
  const node = { guid: "orders", label: "Orders", type: "imports.text" }

  const failedRead = (attempt: number) =>
    toolPart(
      attempt === 1 ? "prt_loginom_read_first" : "prt_loginom_read_second",
      readTool,
      "error",
      { ...input, operation_id: `read-${attempt}` },
      {
        error: secret,
        metadata: {
          loginom: {
            v: 1,
            operationId: `read-${attempt}`,
            kind: "read",
            state: "settled",
            status: "FAILED",
            phase: "read",
            node,
          },
        },
      },
    )

  const history: SessionMessageInfo[] = [userMessage(), assistantMessage([failedRead(1), failedRead(2)])]

  let retries = 0
  let retryID: string | undefined
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await setupTimeline(page, {
    locale: "ru",
    viewport: { width: 1280, height: 860 },
    tabs: [sessionID],
    pageMessages: () => ({ items: history }),
    onRpc: ({ rpcID, method }) =>
      rpcID === "loginom.connection" && method === "status" ? { output: connection(true) } : undefined,
    onPrompt({ body }) {
      retries++
      const prompt = decodeRetry(body)
      retryID = prompt.id
      expect(prompt.text).toContain(readTool)
      expect(prompt.metadata.displayText).toBe("Запрос на повтор отправлен")
      expect(prompt.metadata.loginomRetry).toBe("prt_loginom_read_second")
      const retryMessage = userMessage([], { id: prompt.id, created: 1700000004000 })
      retryMessage.text = prompt.text
      retryMessage.metadata = prompt.metadata
      history.push(retryMessage)
    },
  })

  const block = page.locator("section").filter({ has: page.getByRole("heading", { name: "Шаг не выполнен" }) })
  const retry = block.getByRole("button", { name: "Повторить шаг" })
  await expect(retry).toBeEnabled()
  await expect(retry).toBeInViewport()

  const attention = page
    .locator("[data-titlebar-tab]:visible")
    .getByRole("img", { name: "Шаг Loginom требует внимания" })

  await expect(attention).toBeVisible()
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
  const pending = page.getByText("Ждём результат повтора…", { exact: true })
  const succeeded = page.getByText("Вы повторили шаг", { exact: true })
  await expect(pending).toBeVisible()
  await expect(succeeded).toHaveCount(0)
  await expect(attention).toBeVisible()
  await page.reload()
  await expect(page.getByText("Запрос на повтор отправлен", { exact: true })).toBeVisible()
  await expect(pending).toBeVisible()
  await expect(attention).toBeVisible()

  const result = (metadata: Record<string, JsonValue>, execution = input.execution, poll?: Record<string, JsonValue>) =>
    assistantMessage(
      [
        toolPart(
          "prt_loginom_read_retry",
          readTool,
          "completed",
          { ...input, execution, operation_id: "new-read", budget_ms: 10_000 },
          { metadata },
        ),
        ...(poll
          ? [
              toolPart(
                "prt_loginom_read_poll",
                "loginom_dock_node_wait",
                "completed",
                { operation_id: "new-read" },
                { metadata: poll },
              ),
            ]
          : []),
      ],
      { id: "msg_loginom_retried", parentID: retryID, created: 1700000005000 },
    )

  const receipt = { v: 1, operationId: "new-read", kind: "read", phase: "read", node }
  const running = { loginomPending: true, loginom: { ...receipt, state: "running" } }
  const completed = { loginom: { ...receipt, state: "settled", status: "SUCCEEDED" } }
  history.push(result(running))
  await page.reload()
  await expect(pending).toBeVisible()
  await expect(succeeded).toHaveCount(0)
  await expect(attention).toBeVisible()

  const unconfirmed = page.getByText("После повтора выполнение шага не подтверждено.")

  for (const unrelated of [
    result({}),
    result({ loginom: { ...completed.loginom, node: { ...node, guid: "another-node" } } }),
    result({ loginom: { ...completed.loginom, kind: "execute" } }),
    result(completed, "execute"),
  ]) {
    history[history.length - 1] = unrelated
    await page.reload()
    await expect(unconfirmed).toBeVisible()
    await expect(succeeded).toHaveCount(0)
    await expect(attention).toBeVisible()
  }

  history[history.length - 1] = result(running, "existing", completed)
  await page.reload()
  await expect(succeeded).toBeVisible()
  await expect(block).toHaveCount(0)
  await expect(attention).toHaveCount(0)
})

for (const request of ["check", "retry"] as const) {
  test(`Loginom: reopening the tab unlocks an interrupted ${request}`, async ({ page }) => {
    const tool = request === "check" ? writeTool : readTool

    const failed = (id: string) =>
      toolPart(
        id,
        tool,
        "error",
        {},
        {
          metadata: {
            loginom: {
              v: 1,
              operationId: "interrupted-step",
              state: "settled",
              ...(request === "check" ? { status: "AMBIGUOUS" } : { kind: "read", status: "FAILED" }),
            },
          },
        },
      )

    const sent: string[] = []
    await setupTimeline(page, {
      locale: "ru",
      tabs: [sessionID],
      messages: [
        userMessage(),
        assistantMessage(
          request === "check" ? [failed("prt_interrupted")] : [failed("prt_first"), failed("prt_interrupted")],
        ),
      ],
      onRpc({ rpcID, method }) {
        if (rpcID === "loginom.connection" && method === "status") return { output: connection(true) }

        if (rpcID === "loginom.write-outcome" && method === "check")
          return { output: { operationId: "interrupted-step", status: "applied" } }
      },
      onPrompt: ({ body }) => void sent.push(decodeRetry(body).id),
    })

    const blocked = Promise.withResolvers<void>()
    const received = Promise.withResolvers<void>()
    let admissionID: string | undefined

    const route =
      request === "check" ? "**/api/rpc/loginom.write-outcome/check*" : `**/api/session/${sessionID}/prompt*`

    await page.route(
      route,
      async (route) => {
        if (request === "retry") admissionID = decodeRetry(route.request().postDataJSON()).id
        received.resolve()
        await blocked.promise
        await route.abort().catch(() => undefined)
      },
      { times: 1 },
    )

    const button = page.getByRole("button", {
      name: request === "check" ? "Проверить состояние" : "Повторить шаг",
      exact: true,
    })

    const tab = page.locator("[data-titlebar-tab]:visible").filter({ hasText: "Timeline visual stability" })

    try {
      await button.click()
      await received.promise
      await expect(
        request === "check" ? page.getByRole("button", { name: "Проверяем состояние пакета…" }) : button,
      ).toBeDisabled()
      await tab.getByRole("button", { name: "Закрыть вкладку" }).click()
      await expect(button).toHaveCount(0)
      await page.locator('[data-component="home-session-row"]').filter({ hasText: "Timeline visual stability" }).click()
      await expect(button).toBeEnabled()
      await button.click()

      if (request === "check") await expect(page.getByRole("heading", { name: "Шаг применён" })).toBeVisible()
      else await expect.poll(() => sent).toEqual([admissionID])
    } finally {
      blocked.resolve()
    }
  })
}

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
            },
          },
        ),
      ]),
    ],
    onRpc({ rpcID, method, body }) {
      if (rpcID === "loginom.connection" && method === "status") return { output: connection(true) }

      if (rpcID !== "loginom.write-outcome" || method !== "check") return
      expect(body).toMatchObject({ input: { sessionID, operationId: "operation-1" } })

      return {
        output: {
          status: "not_applied",
          operationId: "operation-1",
          step: { outcome: "not_applied", retryAvailable: false, persistence: "step_unsaved", save: null },
        },
      }
    },
  })
  await page.getByRole("button", { name: "Проверить состояние", exact: true }).click()
  await expect(page.getByText("Изменения шага не сохранены.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Повторить шаг" })).toBeDisabled()
})

for (const outcome of ["applied", "not_applied", "unknown", "different-operation"] as const) {
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
                loginom: {
                  v: 1,
                  operationId: "write-2",
                  state: "settled",
                  status: "AMBIGUOUS",
                },
              },
            },
          ),
        ]),
      ],
      onRpc({ rpcID, method, body }) {
        if (rpcID === "loginom.connection" && method === "status") return { output: connection(ready) }

        if (rpcID !== "loginom.write-outcome" || method !== "check") return
        checks++
        expect(body).toMatchObject({ input: { sessionID, operationId: "write-2" } })

        const negative = outcome === "not_applied" || outcome === "different-operation"

        return {
          output: {
            status: negative ? "not_applied" : outcome,
            operationId: outcome === "different-operation" ? "another-operation" : "write-2",
            readback: outcome === "unknown" ? "changed" : "observed",
            step: negative
              ? { outcome: "not_applied", retryAvailable: true, persistence: "step_unsaved", save: null }
              : undefined,
          },
        }
      },
      onPrompt: () => void prompts++,
    })

    const heading = page.getByRole("heading", { name: "Нужно проверить состояние" })
    const check = page.getByRole("button", { name: "Проверить состояние", exact: true })
    const retry = page.getByRole("button", { name: "Повторить шаг", exact: true })
    await expect(heading).toBeVisible()
    await expect(page.getByText("Loginom пока не готов.")).toBeVisible()
    await expect(check).toBeEnabled()
    await expect(retry).toBeDisabled()
    await expect(page.getByText("Сохранение этого шага не подтверждено.")).toBeVisible()
    expect(checks).toBe(0)

    if (outcome === "unknown") {
      await expect(check).toBeInViewport()
      await page.screenshot({ path: test.info().outputPath("step-check-required-390.png"), animations: "disabled" })
    }

    await check.click()
    ready = true

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

test("Loginom: refreshed history updates the save on the mounted failure", async ({ page }) => {
  const toolID = "prt_loginom_save_refresh"

  const failed = (saved: boolean) =>
    toolPart(
      toolID,
      writeTool,
      "error",
      {},
      {
        metadata: {
          loginom: {
            v: 1,
            operationId: "write-3",
            state: "settled",
            status: "AMBIGUOUS",
            step: {
              outcome: "check_required",
              retryAvailable: false,
              persistence: saved ? "saved_through" : "unknown",
              save: saved
                ? {
                    operationId: "save-1",
                    path: "/user/copy.lgp",
                    throughStep: { operationId: "read-1", label: "Импорт данных" },
                  }
                : null,
            },
          },
        },
      },
    )

  const history: SessionMessageInfo[] = [
    userMessage(),
    assistantMessage([failed(false), toolPart("prt_follow_up", "shell", "running", { command: "pwd" })]),
  ]

  const timeline = await setupTimeline(page, { locale: "ru", pageMessages: () => ({ items: history }) })
  const unconfirmed = page.getByText("Сохранение этого шага не подтверждено.")
  await expect(unconfirmed).toBeVisible()
  const heading = page.getByRole("heading", { name: "Нужно проверить состояние" })
  const original = await heading.elementHandle()

  history[1] = assistantMessage([failed(true)])
  await timeline.send(status("idle"))

  await expect(page.getByText("Сохранено до шага «Импорт данных».")).toBeVisible()
  await expect(unconfirmed).toHaveCount(0)
  expect(await original?.evaluate((element) => element.isConnected)).toBe(true)
})
