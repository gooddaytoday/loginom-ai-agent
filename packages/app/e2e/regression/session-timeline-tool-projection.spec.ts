import { expect, test } from "@playwright/test"
import { timelinePresets } from "@opencode/session-ui/timeline/detail"
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
    "loginom_file_profile",
    "completed",
    {},
    {
      metadata: {
        loginom: {
          v: 1,
          operationId: "read",
          state: "settled",
          status: "SUCCEEDED",
          kind: "import",
          sourceName: "sales-demo.csv",
        },
      },
    },
  )
}

function loginomBuild() {
  return toolPart(
    "prt_loginom_build",
    "loginom_dock_node_apply",
    "completed",
    {},
    {
      metadata: {
        loginom: { v: 1, operationId: "build", state: "settled", status: "SUCCEEDED", kind: "build", nodeCount: 4 },
      },
    },
  )
}

for (const [width, newTimeline] of [
  [1280, false],
  [390, true],
] as const) {
  test(`Loginom live plan at ${width}px`, async ({ page }, testInfo) => {
    await setupTimeline(page, {
      locale: "ru",
      viewport: { width, height: 850 },
      settings: { newTimeline, timelineDetail: timelinePresets[2].value },
      messages: [
        userMessage([userText("Построй сценарий ABC-анализа по продажам.")]),
        assistantMessage(
          [
            toolPart("prt_loginom_todo", "todowrite", "completed", { todos: loginomPlan }),
            loginomRead(),
            toolPart("prt_loginom_build", "loginom_dock_node_apply", "running", {}),
          ],
          { completed: false },
        ),
      ],
    })

    const plan = page.getByRole("list", { name: "План", exact: true })
    await expect(plan.getByRole("listitem")).toHaveText([
      /✓.*Прочитать таблицу/,
      /●.*Собрать сценарий/,
      /○.*Сохранить пакет/,
    ])
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
            loginomBuild(),
            textPart(
              "prt_loginom_answer",
              "Готово. Сценарий проверен.\n\n[ABC-анализ.lgp](https://example.test/ABC.lgp)",
            ),
          ],
          { created: 1700000036000 },
        ),
      ],
    })

    const summary = page.getByRole("button", { name: /^Работал 37 с · / })
    const answer = page.getByText("Готово. Сценарий проверен.")
    const result = page.getByRole("link", { name: "ABC-анализ.lgp" })

    const step = page.locator('[data-timeline-part-id="prt_loginom_read"]')

    await expect(summary).toHaveText("Работал 37 с · прочитал таблицу «sales-demo.csv», собрал сценарий из 4 узлов")
    await expect(summary).toHaveAttribute("aria-expanded", "false")
    await expect(step).toHaveCount(0)
    await expect(answer).toBeVisible()
    await expect(result).toBeVisible()
    await expect(page.getByRole("list", { name: "План", exact: true })).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath(`loginom-summary-${width}.png`), animations: "disabled" })

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
