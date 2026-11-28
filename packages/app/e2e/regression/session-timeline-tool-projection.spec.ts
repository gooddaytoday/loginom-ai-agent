import { expect, test } from "@playwright/test"
import { timelinePresets } from "@opencode/session-ui/timeline/detail"
// Captured from the projection functions in #1471 (32f1f5fbe4), #1504 (d4c352d4fe) and #1484 (e743ae4ec0).
import loginomReceipts from "../utils/loginom-feed-receipts.json" with { type: "json" }
import {
  assistantMessage,
  partUpdated,
  reasoningPart,
  setupTimeline,
  textPart,
  toolPart,
  userMessage,
  userText,
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

const loginomPlan = [
  { content: "Прочитать таблицу", status: "completed" },
  { content: "Собрать сценарий", status: "in_progress" },
  { content: "Сохранить пакет", status: "pending" },
  { content: "Открыть результат", status: "pending" },
]

function loginomRead() {
  return toolPart(
    "prt_loginom_read",
    "loginom_dock_node_read",
    "completed",
    {},
    {
      metadata: { loginom: loginomReceipts.read },
    },
  )
}

function loginomSave() {
  return toolPart(
    "prt_loginom_save",
    "loginom_dock_action_run",
    "completed",
    {},
    {
      metadata: { loginom: loginomReceipts.save },
    },
  )
}

function loginomExport() {
  return toolPart(
    "prt_loginom_export",
    "loginom_dock_node_apply",
    "completed",
    {},
    {
      metadata: { loginom: loginomReceipts.export },
    },
  )
}

for (const [width, newTimeline] of [
  [1280, false],
  [390, true],
] as const) {
  test(`Loginom live plan at ${width}px`, async ({ page }, testInfo) => {
    const timeline = await setupTimeline(page, {
      locale: "ru",
      viewport: { width, height: 850 },
      settings: { newTimeline, timelineDetail: timelinePresets[2].value },
      messages: [
        userMessage([userText("Построй сценарий ABC-анализа по продажам.")]),
        assistantMessage([toolPart("prt_loginom_todo", "todowrite", "completed", { todos: loginomPlan })], {
          completed: false,
        }),
      ],
    })

    const plan = page.getByRole("list", { name: "План", exact: true })
    await expect(plan.getByRole("listitem")).toHaveText([
      /✓.*Прочитать таблицу/,
      /●.*Собрать сценарий/,
      /○.*Сохранить пакет/,
    ])
    await expect(plan.getByText("Собрать сценарий")).toHaveAttribute("aria-current", "step")
    const step = "prt_loginom_read"
    await timeline.send(partUpdated(toolPart(step, "loginom_dock_node_read", "running", {})))
    await expect(page.locator(`[data-timeline-part-ids="${step}"], [data-timeline-part-id="${step}"]`)).toHaveCount(1)
    await expect(plan.getByText("Собрать сценарий")).toHaveAttribute("aria-current", "step")
    await expect(page.getByRole("button", { name: /^Работал / })).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath(`loginom-plan-${width}.png`), animations: "disabled" })
  })

  test(`Loginom completed turn at ${width}px`, async ({ page }, testInfo) => {
    const viewport = { width, height: 850 }
    await setupTimeline(page, {
      locale: "ru",
      viewport,
      settings: { newTimeline, timelineDetail: timelinePresets[2].value },
      messages: [
        userMessage([userText("Построй сценарий ABC-анализа по продажам.")]),
        assistantMessage(
          [
            reasoningPart("prt_loginom_thought", "Проверю входные поля и пороги."),
            loginomRead(),
            loginomExport(),
            loginomSave(),
            textPart(
              "prt_loginom_answer",
              "Готово. Сценарий проверен.\n\n[ABC-анализ.csv](https://example.test/ABC.csv)",
            ),
          ],
          { created: 1700000036000 },
        ),
      ],
    })

    const summary = page.getByRole("button", { name: /^Работал 37 с · / })
    const answer = page.getByText("Готово. Сценарий проверен.")
    const result = page.getByRole("link", { name: "ABC-анализ.csv" })

    const step = page.locator('[data-timeline-part-id="prt_loginom_read"]')

    await expect(summary).toHaveText(
      "Работал 37 с · прочитал результат узла «Продажи», выгрузил «ABC-анализ.csv», сохранил «ABC-анализ.lgp» в /user",
    )
    await expect(summary).toHaveAttribute("aria-expanded", "false")
    await expect(step).toHaveCount(0)
    await expect(answer).toBeVisible()
    await expect(result).toBeVisible()
    await expect(page.getByRole("list", { name: "План", exact: true })).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath(`loginom-summary-${width}.png`), animations: "disabled" })

    await page.keyboard.press("Control+,")
    const settings = page.getByTestId("settings-screen")
    const slider = settings.getByRole("slider", { name: "Подробности временной шкалы", exact: true })
    await expect(slider).toBeEnabled()
    await slider.press("ArrowRight")
    await expect(slider).toHaveAttribute("aria-valuetext", "Подробно")
    await settings.getByRole("button", { name: "Назад в приложение", exact: true }).click()
    await expect(settings).toBeHidden()
    await expect(summary).toHaveAttribute("aria-expanded", "true")
    await expect(step).toBeVisible()
    await expect(result).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`loginom-detailed-${width}.png`), animations: "disabled" })

    await page.reload()
    await expect(summary).toHaveAttribute("aria-expanded", "false")
    await expect(step).toHaveCount(0)
    await summary.focus()
    await summary.press("Enter")
    await expect(summary).toHaveAttribute("aria-expanded", "true")
    await expect(step).toBeVisible()
    await expect(answer).toBeVisible()
    await expect(result).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`loginom-expanded-${width}.png`), animations: "disabled" })

    await page.reload()
    await expect(summary).toHaveAttribute("aria-expanded", "true")
    await summary.click()
    await expect(summary).toHaveAttribute("aria-expanded", "false")
    await expect(step).toHaveCount(0)
    await expect(answer).toBeVisible()
    await expect(result).toBeVisible()
  })
}

test("a shell notice reveals a hidden call in a completed Loginom turn", async ({ page }) => {
  await setupTimeline(page, {
    sessionMessages: [
      userMessage(),
      assistantMessage([
        loginomRead(),
        toolPart(
          "prt_loginom_shell",
          "shell",
          "completed",
          { command: "bun serve.ts" },
          {
            output: "listening",
            metadata: { shellID: "shell_loginom", status: "running" },
          },
        ),
      ]),
      {
        id: "msg_1002_shell_finished",
        type: "synthetic",
        text: '<shell id="shell_loginom" state="completed" command="bun serve.ts">\nlistening\n</shell>',
        description: "bun serve.ts",
        metadata: { source: "shell", shellID: "shell_loginom", state: "completed" },
        time: { created: 1700000003000 },
      },
    ],
  })

  const summary = page.getByRole("button", { name: /^Worked / })
  const notice = page.getByRole("button", { name: /^Shell finished/ })
  const call = page.locator('[data-timeline-part-id="prt_loginom_shell"]')

  await expect(summary).toHaveAttribute("aria-expanded", "false")
  await expect(call).toHaveCount(0)
  await notice.click()
  await expect(summary).toHaveAttribute("aria-expanded", "true")
  await expect(call).toBeInViewport()
})

test("an OpenCode turn keeps its native tools and reply", async ({ page }) => {
  await setupTimeline(page, {
    messages: [
      userMessage([userText("Read the notes.")]),
      assistantMessage([
        toolPart("prt_native_read", "read", "completed", { path: "notes.md" }),
        textPart("prt_native_reply", "The notes are ready."),
      ]),
    ],
  })

  const tools = page.locator('[data-timeline-part-ids="prt_native_read"]')
  await expect(tools.getByRole("button")).toHaveAccessibleName(/read/i)
  await expect(page.getByText("The notes are ready.")).toBeVisible()
  await expect(page.getByRole("button", { name: /^Worked / })).toHaveCount(0)
})
