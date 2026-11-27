import { expect, test, type Page } from "@playwright/test"
import { assistantMessage, setupTimeline, textPart, toolPart, userMessage, userText } from "../utils/timeline"

const exportRequest = { finish: "execute", target: { kind: "existing", type: "exports.text" } }

const report = {
  artifact_id: "csv-export-1",
  name: "Продажи за период.csv",
  destination: "/agent/Продажи/Продажи за период.csv",
  bytes: 512,
  sha256: "34".repeat(32),
  verification_id: "verification-1",
  node: { document_id: "doc-sales", workflow_id: "workflow-main", node_id: "node-sales-export" },
}

const detailReport = {
  ...report,
  artifact_id: "csv-export-2",
  name: "Продажи по регионам и городам.csv",
  destination: "/agent/Продажи/Отчёты/Продажи по регионам и городам.csv",
  verification_id: "verification-2",
  node: { ...report.node, node_id: "node-region-export" },
}

const localFile = { artifact_id: report.artifact_id, name: report.name, path: `/tmp/fixture/${report.name}` }

function confirmed(
  id: string,
  receipt: typeof report = report,
  outputFiles = [localFile],
  tool = "loginom_dock_node_apply",
) {
  const input = tool === "loginom_dock_node_apply" ? exportRequest : { operation_id: "sales" }

  return toolPart(id, tool, "completed", input, {
    metadata: { loginom: { export: receipt }, outputFiles },
  })
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
  await setupTimeline(page, {
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
  await expect(card.getByText(`Узел «${report.node.node_id}»`)).toBeVisible()
  await expect(card.getByText(`Путь в Loginom: ${report.destination}`)).toBeVisible()
  await expect(card.getByText(/512\s*Б/)).toBeVisible()
  const open = card.getByRole("button", { name: "Открыть папку" })
  await expect(open).toBeEnabled()
  await open.click()
  await expect.poll(() => revealed).toEqual([localFile.path])
  await page.screenshot({ path: testInfo.outputPath("loginom-exports-1280.png"), animations: "disabled" })
})

test("shows two confirmed export cards at 390 px", async ({ page }, testInfo) => {
  await setupTimeline(page, {
    locale: "ru",
    viewport: { width: 390, height: 850 },
    settings: { newTimeline: false },
    messages: [
      userMessage([userText("Выгрузи продажи и отчёт по регионам.")]),
      assistantMessage([
        confirmed("prt_export"),
        confirmed("prt_export_wait", detailReport, [], "loginom_dock_node_wait"),
        answer(),
      ]),
    ],
  })

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

test("lists the same receipt once when status repeats a confirmed export", async ({ page }) => {
  await setupTimeline(page, {
    locale: "ru",
    messages: [
      userMessage(),
      assistantMessage([
        confirmed("prt_export"),
        confirmed("prt_export_status", report, [], "loginom_dock_node_status"),
        answer(),
      ]),
    ],
  })
  await expect(page.getByText(`Файлы этого хода: ${report.name}`, { exact: true })).toBeVisible()
})

test("prints the empty file summary when the export failed", async ({ page }) => {
  await setupTimeline(page, {
    locale: "ru",
    messages: [
      userMessage([userText("Выгрузи отчёт.")]),
      assistantMessage([
        toolPart("prt_failed_export", "loginom_dock_node_apply", "error", exportRequest),
        textPart("prt_no_files", "Экспорт завершился ошибкой."),
      ]),
    ],
  })
  await expect(page.getByText("Экспорт завершился ошибкой.", { exact: true })).toBeVisible()
  await expect(page.getByText("Файлы не создавались", { exact: true })).toBeVisible()
  await expect(page.getByRole("group", { name: report.name })).toHaveCount(0)
})

test("omits the file summary and card for a table sample", async ({ page }) => {
  await setupTimeline(page, {
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
  })
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
  await setupTimeline(page, {
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
