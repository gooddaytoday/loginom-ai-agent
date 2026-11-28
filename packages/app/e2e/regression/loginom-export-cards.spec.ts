import { expect, test, type Page } from "@playwright/test"
import {
  assistantMessage,
  sessionID,
  setupTimeline,
  textPart,
  toolPart,
  userID,
  userMessage,
  userText,
} from "../utils/timeline"
// Capture from #1471 loginomFeedMetadata and the #1510 export receipt projection and SQLite turn lookup.
import receipts from "./fixtures/loginom-export-receipts.json" with { type: "json" }

const exportRequest = { finish: "execute", target: { kind: "existing", type: "exports.text" } }

const report = receipts.first.loginom.export

const detailReport = receipts.second.loginom.export

const [localFile] = receipts.first.outputFiles

const repeatID = "msg_2000_timeline_user"

const turnPath = /\/api\/rpc\/loginom\.exports\/turn(?:\?|$)/u

async function setupExportTimeline(
  page: Page,
  input: NonNullable<Parameters<typeof setupTimeline>[1]>,
  first = receipts.single,
) {
  await setupTimeline(page, {
    ...input,
    beforeNavigate: () =>
      page.route(turnPath, (route) => {
        if (route.request().method() !== "POST") return route.fallback()

        const body = route.request().postDataJSON()
        const output = body.input.sessionID === sessionID && body.input.messageID === userID ? first : receipts.empty

        return route.fulfill({ headers: { "access-control-allow-origin": "*" }, json: { output } })
      }),
  })
}

function confirmed(
  id: string,
  metadata: typeof receipts.first | typeof receipts.second = receipts.first,
  tool = "loginom_dock_node_apply",
) {
  const input = tool === "loginom_dock_node_apply" ? exportRequest : { operation_id: metadata.loginom.operationId }

  return toolPart(id, tool, "completed", input, { metadata })
}

function answer() {
  return textPart("prt_answer", "Готово. Отчёт по продажам в папке «Продажи».")
}

function timeline(page: Page) {
  return page.locator(".scroll-view__viewport", { has: page.locator("[data-timeline-row]") })
}

async function showActivity(page: Page) {
  await page.getByRole("button", { name: /^Работал / }).click()
}

test("shows one confirmed export after the step and names the file after the answer", async ({ page }, testInfo) => {
  const revealed: string[] = []
  await page.route("**/e2e/reveal-path", async (route) => {
    const request = route.request().postDataJSON()

    if (!request.checkOnly) revealed.push(request.path)
    await route.fulfill({ status: request.path === localFile.path ? 204 : 404 })
  })
  await setupExportTimeline(page, {
    desktopReveal: true,
    locale: "ru",
    viewport: { width: 1280, height: 850 },
    settings: { newTimeline: true },
    messages: [
      userMessage([userText("Выгрузи CSV с продажами за период.")]),
      assistantMessage([confirmed("prt_export"), answer()]),
    ],
  })

  const footer = page.getByText(`Файлы этого хода: ${report.name}`, { exact: true })
  await expect(footer).toBeVisible()
  await expect(timeline(page)).toHaveText(
    new RegExp(`Готово\\. Отчёт по продажам в папке «Продажи»\\.[\\s\\S]*Файлы этого хода:`),
  )
  await showActivity(page)

  const card = page.getByRole("group", { name: report.name })
  await expect(card.getByText("Узел «Выгрузка продаж»", { exact: true })).toBeVisible()
  await expect(card.getByText(report.node.node_id, { exact: false })).toHaveCount(0)
  await expect(card.getByText(`Путь в Loginom: ${report.destination}`)).toBeVisible()
  await expect(card.getByText(/512\s*Б/)).toBeVisible()
  const open = card.getByRole("button", { name: "Открыть папку" })
  await expect(open).toBeEnabled()
  await open.click()
  await expect.poll(() => revealed).toEqual([localFile.path])
  await page.screenshot({ path: testInfo.outputPath("loginom-exports-1280.png"), animations: "disabled" })
})

test("shows two confirmed export cards at 390 px", async ({ page }, testInfo) => {
  await setupExportTimeline(
    page,
    {
      locale: "ru",
      viewport: { width: 390, height: 850 },
      settings: { newTimeline: false },
      messages: [
        userMessage([userText("Выгрузи продажи и отчёт по регионам.")]),
        assistantMessage([
          confirmed("prt_export"),
          confirmed("prt_export_wait", receipts.second, "loginom_dock_node_wait"),
          answer(),
        ]),
      ],
    },
    receipts.double,
  )

  await expect(page.getByText("Готово. Отчёт по продажам в папке «Продажи».", { exact: true })).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByText(`Файлы этого хода: ${report.name} и ${detailReport.name}`, { exact: true })).toBeVisible()
  await showActivity(page)
  await expect(page.getByRole("group", { name: report.name })).toBeInViewport()
  const card = page.getByRole("group", { name: detailReport.name })
  await expect(card).toBeInViewport()
  await expect(card.getByText(detailReport.destination, { exact: false })).toBeVisible()
  await expect(card.getByRole("button", { name: "Открыть папку" })).toHaveCount(0)
  expect(await card.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath("loginom-exports-390.png"), animations: "disabled" })
})

test("reads files for the owning turn even when only a later status call is loaded", async ({ page }) => {
  const repeated = page.waitForResponse(
    (response) =>
      response.url().includes("/api/rpc/loginom.exports/turn") &&
      response.request().postDataJSON().input.messageID === repeatID,
  )

  await setupExportTimeline(page, {
    locale: "ru",
    messages: [
      userMessage(),
      assistantMessage([answer()]),
      userMessage([userText("Проверь состояние выгрузки.")], { id: repeatID, created: 1700000003000 }),
      assistantMessage(
        [
          toolPart(
            "prt_export_status",
            "loginom_dock_node_status",
            "completed",
            { operation_id: "sales" },
            {
              metadata: receipts.repeated,
            },
          ),
          textPart("prt_status_answer", "Выгрузка завершилась."),
        ],
        { id: "msg_2001_timeline_assistant", parentID: repeatID, created: 1700000004000 },
      ),
    ],
  })
  expect((await repeated).ok()).toBe(true)
  await expect(page.getByText("Выгрузка завершилась.", { exact: true })).toBeVisible()
  const first = page.locator(`[data-message-id="${userID}"][data-timeline-row="TurnPresentation"]`)
  const second = page.locator(`[data-message-id="${repeatID}"][data-timeline-row="TurnPresentation"]`)
  await expect(first.getByText(`Файлы этого хода: ${report.name}`, { exact: true })).toBeVisible()
  await expect(second.getByText(/Файлы этого хода|Файлы не создавались/)).toHaveCount(0)
})

test("prints the empty file summary when the export failed", async ({ page }) => {
  await setupExportTimeline(
    page,
    {
      locale: "ru",
      messages: [
        userMessage([userText("Выгрузи отчёт.")]),
        assistantMessage([
          toolPart("prt_failed_export", "loginom_dock_node_apply", "error", exportRequest),
          textPart("prt_no_files", "Экспорт завершился ошибкой."),
        ]),
      ],
    },
    receipts.empty,
  )
  await expect(page.getByText("Экспорт завершился ошибкой.", { exact: true })).toBeVisible()
  await expect(page.getByText("Файлы не создавались", { exact: true })).toBeVisible()
  await expect(page.getByRole("group", { name: report.name })).toHaveCount(0)
})

test("omits the file summary and card for a table sample", async ({ page }) => {
  await setupExportTimeline(
    page,
    {
      locale: "ru",
      messages: [
        userMessage([userText("Прочитай образец.")]),
        assistantMessage([
          toolPart(
            "prt_sample",
            "loginom_dock_node_read",
            "completed",
            {},
            {
              metadata: { outputFiles: [localFile] },
            },
          ),
          textPart("prt_sample_answer", "Прочитал образец."),
        ]),
      ],
    },
    receipts.empty,
  )
  await expect(page.getByText("Прочитал образец.", { exact: true })).toBeVisible()
  await expect(page.getByText(/Файлы этого хода|Файлы не создавались/)).toHaveCount(0)
  await expect(page.getByRole("group", { name: report.name })).toHaveCount(0)
})

test("focus rechecks a local file without detaching the timeline or resetting scroll", async ({ page }) => {
  let checks = 0
  const pending = Promise.withResolvers<void>()
  await page.route("**/e2e/reveal-path", async (route) => {
    checks += 1

    if (checks === 1) return route.fulfill({ status: 204 })
    await pending.promise
    await route.fulfill({ status: 404 })
  })
  await setupExportTimeline(page, {
    desktopReveal: true,
    locale: "ru",
    seedHistory: true,
    reducedMotion: true,
    viewport: { width: 1280, height: 720 },
    messages: [userMessage(), assistantMessage([confirmed("prt_export"), answer()])],
  })
  await showActivity(page)
  const card = page.getByRole("group", { name: report.name })
  const button = card.getByRole("button", { name: "Открыть папку" })
  await expect(button).toBeEnabled()
  const scroller = timeline(page)
  await scroller.hover()
  const beforeScroll = await scroller.evaluate((element) => element.scrollTop)
  await page.mouse.wheel(0, -150)
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeLessThan(beforeScroll)

  const position = await scroller.evaluate((element) => {
    element.dataset.detached = "false"
    new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.removedNodes) if (node.contains(element)) element.dataset.detached = "true"
    }).observe(document.body, { childList: true, subtree: true })

    return element.scrollTop
  })

  expect(position).toBeGreaterThan(0)

  try {
    await page.evaluate(() => window.dispatchEvent(new FocusEvent("focus")))
    await expect.poll(() => checks).toBe(2)
    await expect(button).toBeEnabled()
    expect(await scroller.evaluate((element) => element.scrollTop)).toBe(position)
  } finally {
    pending.resolve()
  }

  await expect(button).toBeDisabled()
  await expect(card.getByText(report.name, { exact: true })).toBeVisible()
  await expect(page.getByText(`Файлы этого хода: ${report.name}`, { exact: true })).toHaveCount(1)
  await expect(scroller).toHaveAttribute("data-detached", "false")
  expect(await scroller.evaluate((element) => element.scrollTop)).toBe(position)
})
