import { expect, test } from "@playwright/test"
import { timelinePresets } from "@opencode/session-ui/timeline/detail"
import { setupPackageChanges } from "../utils/loginom-package-changes"
import { assistantMessage, partUpdated, setupTimeline, textPart, toolPart, userMessage } from "../utils/timeline"

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

test("shows a package changes result and saves and undoes a version", async ({ page }, testInfo) => {
  const { card, calls, sessionID, version, copyUrl } = await setupPackageChanges(page)
  await expect(card.getByText("копия агента")).toBeVisible()
  await expect(card.getByRole("list", { name: "Счётчики изменений" }).getByRole("listitem")).toHaveText([
    "+1 добавлено",
    "~3 изменено",
    "−1 удалено",
  ])
  const nodes = card.getByRole("list", { name: "Изменённые узлы" })
  await expect(nodes.getByRole("listitem")).toHaveCount(5)
  await expect(nodes.getByText("Импорт продаж — изменены связи", { exact: true })).toBeVisible()
  await expect(nodes.getByText(/Фильтр по дате — .*изменены связи/)).toBeVisible()
  await expect(nodes.getByText(/Итоги продаж — переименован из «Группировка»/)).toBeVisible()
  await expect(nodes.locator("del")).toHaveText("Промежуточная выгрузка")
  await expect(card.getByText("Сверка запуском: в копии 120 строк, как в исходном пакете.")).toBeVisible()
  const loginom = card.getByRole("button", { name: "Посмотреть в Loginom" })
  await expect(loginom).toBeVisible()
  await expect(card.getByRole("button", { name: "Посмотреть на схеме" })).toHaveCount(0)
  await card.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath("package-changes-1280.png"), animations: "disabled" })
  const opened = page.context().waitForEvent("page")
  await loginom.click()
  const loginomPage = await opened
  await loginomPage.waitForURL(copyUrl)
  await loginomPage.close()

  const save = card.getByRole("button", { name: "Сохранить новой версией" })
  await save.click()
  await expect(card.getByRole("status")).toHaveText("Сохранено новой версией: Продажи — v2.lgp")
  await expect(card.getByRole("button", { name: "Открыть", exact: true })).toBeVisible()
  await card.getByRole("button", { name: "Отменить сохранение" }).click()
  await expect(save).toBeEnabled()
  expect(calls).toEqual([
    { method: "save-version", input: { sessionID } },
    { method: "undo-save", input: { sessionID, path: version } },
  ])
  await card.getByRole("button", { name: "Отменить изменения" }).click()
  await expect(card.getByRole("status")).toHaveText("Изменения отменены.")
  await expect(save).toHaveCount(0)
  expect(calls.at(-1)).toEqual({ method: "discard", input: { sessionID } })
})

test("confirms replacement on a narrow screen and restores the previous version", async ({ page }, testInfo) => {
  const { card, calls, sessionID, backup, schemaUrl } = await setupPackageChanges(page, { width: 390, schema: true })
  const replace = card.getByRole("button", { name: "Заменить исходный…" })
  await expect(replace).toBeEnabled()
  await card.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath("package-changes-390.png"), animations: "disabled" })
  const opened = page.context().waitForEvent("page")
  await card.getByRole("button", { name: "Посмотреть на схеме" }).click()
  const schemaPage = await opened
  await schemaPage.waitForURL(schemaUrl)
  await schemaPage.close()

  await replace.click()
  const dialog = page.getByRole("dialog", { name: "Заменить исходный пакет?" })
  await expect(dialog).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0)
  expect(calls).toEqual([])

  await replace.click()
  await dialog.getByRole("button", { name: "Заменить", exact: true }).click()
  await expect(card.getByRole("status")).toHaveText(`Исходный пакет заменён. Резервная копия: ${backup}`)
  await card.getByRole("button", { name: "Вернуть прежнюю версию" }).click()
  await expect(card.getByRole("status")).toHaveText("Прежняя версия восстановлена.")
  expect(calls).toEqual([
    { method: "replace-original", input: { sessionID, confirmed: true } },
    { method: "restore-previous", input: { sessionID, backupPath: backup } },
  ])
})

test("keeps the draft when Loginom says the package is busy", async ({ page }) => {
  const { card, calls, sessionID } = await setupPackageChanges(page, { busy: true })
  await card.getByRole("button", { name: "Заменить исходный…" }).click()
  await page
    .getByRole("dialog", { name: "Заменить исходный пакет?" })
    .getByRole("button", { name: "Заменить", exact: true })
    .click()
  await expect(card.getByRole("alert")).toHaveText("Пакет занят. Закройте его в Loginom и попробуйте ещё раз.")
  await expect(card.getByRole("button", { name: "Сохранить новой версией" })).toBeEnabled()
  await expect(card.getByRole("button", { name: "Вернуть прежнюю версию" })).toHaveCount(0)
  expect(calls).toEqual([{ method: "replace-original", input: { sessionID, confirmed: true } }])
})

test("does not send a package mutation from a superseded turn", async ({ page }) => {
  const { card, calls } = await setupPackageChanges(page, { stale: true })
  const save = card.getByRole("button", { name: "Сохранить новой версией" })
  await save.click()
  await expect(card.getByRole("alert")).toHaveText(
    "Карточка не относится к последнему завершённому ходу. Пакет не изменён.",
  )
  await expect(save).toBeDisabled()
  expect(calls).toEqual([])
})

function questionInput() {
  return { questions: [{ header: "Stability", question: "Keep it stable?", options: [] }] }
}
