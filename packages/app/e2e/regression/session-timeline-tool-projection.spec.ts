import { expect, test } from "@playwright/test"
import { timelinePresets } from "@opencode/session-ui/timeline/detail"
import {
  assistantMessage,
  partUpdated,
  renderedPartID,
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

for (const mode of ["detailed", "compact"] as const) {
  test(`shows manual Loginom edits in the ${mode} timeline`, async ({ page }, testInfo) => {
    const position = { x: 10, y: 20 }
    const added = { guid: "filter-guid", label: "Фильтр", type: "filter", position }
    const removed = { guid: "sort-guid", label: "Сортировка", type: "sort", position }
    const renamed = { kind: "node_renamed", guid: "import-guid", from: "Импорт", to: "Продажи" }
    const moved = { kind: "node_moved", guid: "import-guid", label: "Продажи", from: position, to: { x: 40, y: 60 } }

    const link = {
      kind: "link_removed",
      link: { source: "import-guid", output: "data-out", target: "sort-guid", input: "data-in" },
      sourceLabel: "Продажи",
      targetLabel: "Сортировка",
    }

    const facts = { v: 1, operationId: "fixture-operation", state: "settled" }
    const editID = "prt_graph_manual_edits"
    const emptyID = "prt_graph_no_edits"
    const saveID = "prt_graph_save"
    const tool = "loginom_dock_action_execute"
    const save = { action_key: "package.save_checkpoint" }

    let schemaReads = 0
    await setupTimeline(page, {
      locale: "ru",
      rpc(params) {
        if (params.rpcID !== "loginom.package" || params.method !== "schema") return

        schemaReads += 1

        return {
          output: {
            snapshot:
              mode === "detailed"
                ? {
                    source: "window",
                    scope: "active_workflow",
                    complete: false,
                    package: { name: "Продажи.lgp" },
                    observed_at: new Date(1700000000000).toISOString(),
                    workflow: {
                      document_id: "sales-package",
                      workflow_id: "sales",
                      navigation_path: ["Продажи"],
                      nodes: [{ ...added, type: "TBGFilterDataEngine", ports: [] }],
                      links: [],
                    },
                  }
                : null,
          },
        }
      },
      viewport: { width: mode === "detailed" ? 1280 : 390, height: 900 },
      settings: {
        timelineDetail: mode === "detailed" ? timelinePresets[1].value : timelinePresets[2].value,
        newTimeline: mode === "detailed",
      },
      messages: [
        userMessage([userText("Запусти схему с моими правками и сохрани пакет.")]),
        assistantMessage([
          toolPart(
            editID,
            tool,
            "completed",
            { action_key: "workflow.run" },
            {
              metadata: {
                loginom: {
                  ...facts,
                  manualEdits: [
                    renamed,
                    { kind: "node_added", node: added },
                    { kind: "node_removed", node: removed },
                    moved,
                    link,
                  ],
                },
              },
            },
          ),
          toolPart(saveID, tool, "completed", save, {
            metadata: {
              loginom: {
                ...facts,
                status: "SUCCEEDED",
                kind: "save",
                package: { name: "Продажи.lgp", directory: "/user" },
                saved_package_graph: {
                  status: "compared",
                  rename_attribution: "observed_during_save",
                  changes: [
                    {
                      kind: "node_renamed",
                      node_id: "merge-guid",
                      before: "Слияние",
                      observed_before_save: "Слияние",
                      saved: "Левое",
                    },
                  ],
                },
              },
            },
          }),
          toolPart(
            emptyID,
            tool,
            "completed",
            { action_key: "workflow.run" },
            {
              metadata: {
                loginom: {
                  ...facts,
                  kind: "read",
                  status: "SUCCEEDED",
                  node: { type: "transform.join", label: "Левое" },
                  manualEdits: [],
                },
              },
            },
          ),
          textPart("prt_graph_follow_up", "Пакет сохранён. В сохранённой схеме узел называется «Левое»."),
        ]),
      ],
    })

    const edits = page.locator(`[data-timeline-part-id="${renderedPartID(editID)}"]`)
    const saved = page.locator(`[data-timeline-part-id="${renderedPartID(saveID)}"]`)
    const empty = page.locator(`[data-timeline-part-id="${renderedPartID(emptyID)}"]`)
    const notice = page.getByText(/^Учёл ваши правки/)
    await expect(notice).toHaveCount(1)
    await expect(edits).toContainText(/^Учёл ваши правки[\s\S]*Выполнил шаг в Loginom/)
    await expect(saved).toContainText(/^Loginom переименовал узел[\s\S]*Сохранил «Продажи.lgp» в \/user/)

    if (mode === "detailed") {
      await expect(edits.getByRole("listitem")).toHaveCount(5)

      for (const [subject, detail] of [
        ["Фильтр", "Узел добавлен"],
        ["Сортировка", "Узел удалён"],
        ["Продажи", "Было «Импорт»"],
        ["Продажи", "Переместили из (10, 20) в (40, 60)"],
        ["Продажи → Сортировка", "Удалили связь · выход data-out → вход data-in"],
      ]) {
        await expect(edits.getByRole("listitem").filter({ hasText: detail })).toContainText(subject)
      }

      await expect.poll(() => schemaReads).toBe(1)
      await expect(edits.getByRole("button", { name: "Фильтр", exact: true })).toBeVisible()
      await expect(edits.getByRole("button", { name: "Сортировка", exact: true })).toHaveCount(0)
    } else {
      await expect(notice).toHaveText(
        "Учёл ваши правки: переименовали «Импорт» в «Продажи», добавили «Фильтр», удалили «Сортировка» и ещё 2 правки.",
      )
      await expect(edits.getByRole("listitem")).toHaveCount(0)
    }

    await expect(saved.getByText("Loginom переименовал узел «Слияние» в «Левое»", { exact: true })).toBeVisible()
    await expect(empty.getByText("Прочитал результат узла «Левое»", { exact: true })).toBeVisible()
    await expect(empty.getByText(/^Учёл ваши правки/)).toHaveCount(0)
    await expect(page.getByText("В сохранённой схеме узел называется «Левое».", { exact: false })).toBeVisible()

    await expect(
      page.getByRole("button", { name: mode === "detailed" ? "Подробно" : "Кратко", exact: true }),
    ).toHaveAttribute("aria-pressed", "true")
    const width = page.viewportSize()?.width
    await page.screenshot({ path: testInfo.outputPath(`manual-edits-${width}.png`), animations: "disabled" })

    if (mode === "detailed") {
      await edits.getByRole("button", { name: "Фильтр", exact: true }).click()
      const diagram = page.getByRole("region", { name: "Схема пакета", exact: true })
      await expect(diagram.getByRole("button", { name: "Фильтр", exact: true })).toHaveAttribute("aria-pressed", "true")
      await page.getByRole("button", { name: "Вернуться к разговору", exact: true }).click()
    }

    await page.getByRole("button", { name: mode === "detailed" ? "Кратко" : "Подробно", exact: true }).click()
    const details = edits.getByText("Узел добавлен", { exact: true })

    if (mode === "detailed") await expect(details).toBeHidden()
    else {
      await expect(details).toBeVisible()
      await expect.poll(() => schemaReads).toBe(1)
      await expect(edits.getByRole("button", { name: "Фильтр", exact: true })).toHaveCount(0)
    }
  })
}
