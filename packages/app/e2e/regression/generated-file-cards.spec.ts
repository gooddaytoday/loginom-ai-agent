import { expect, test } from "@playwright/test"
import {
  assistantMessage,
  setupTimeline,
  textPart,
  toolPart,
  userMessage,
} from "../performance/timeline-stability/fixture"

test("shows a card for a completed export confirmed by the host", async ({ page }) => {
  await setupTimeline(page, {
    messages: [
      userMessage(),
      assistantMessage([
        toolPart(
          "prt_export_file",
          "loginom_dock_node_wait",
          "completed",
          { operation_id: "export" },
          {
            output: JSON.stringify({
              state: "settled",
              status: "SUCCEEDED",
              output: { file_artifacts: [{ artifact_id: "csv-1", destination: "/server/result.csv" }] },
            }),
            metadata: {
              outputFiles: [{ artifact_id: "csv-1", path: "/private/download/result.csv", name: "result.csv" }],
            },
          },
        ),
      ]),
    ],
  })
  const card = page.locator('[data-tid="generated-file-card"]')
  await expect(card).toHaveCount(1)
  await expect(card).toContainText("result.csv")
  // A browser has no native opener; the confirmed file remains visible.
  await expect(card).toBeDisabled()
})

test("model paths, server paths and unfinished exports do not become file cards", async ({ page }) => {
  await setupTimeline(page, {
    messages: [
      userMessage(),
      assistantMessage([
        textPart("prt_invented_file", "Created /private/invented.csv"),
        toolPart(
          "prt_server_file",
          "loginom_dock_node_wait",
          "completed",
          { operation_id: "export" },
          {
            output: JSON.stringify({
              output: { file_artifacts: [{ artifact_id: "csv-1", destination: "/server/result.csv" }] },
            }),
          },
        ),
        toolPart(
          "prt_pending_file",
          "loginom_dock_node_apply",
          "running",
          {},
          {
            metadata: { outputFiles: [{ artifact_id: "pending", path: "/private/pending.csv", name: "pending.csv" }] },
          },
        ),
      ]),
    ],
  })
  await expect(page.getByText("Created /private/invented.csv", { exact: true })).toBeVisible()
  await expect(page.locator('[data-tid="generated-file-card"]')).toHaveCount(0)
})

test("user FilePart cards keep their original download behavior", async ({ page }) => {
  await setupTimeline(page, {
    messages: [
      userMessage([
        {
          id: "prt_user_csv",
          type: "file",
          mime: "text/csv",
          filename: "sales.csv",
          url: "data:text/csv;base64,QQoxCg==",
        },
      ]),
      assistantMessage([textPart("prt_user_csv_reply", "Attached sales.csv")]),
    ],
  })
  const attachment = page.locator('[data-slot="user-message-attachments"] [data-component="attachment-card-v2"]')
  await expect(attachment).toHaveCount(1)
  await expect(attachment).toContainText("sales.csv")
  const download = page.waitForEvent("download")
  await attachment.click()
  expect((await download).suggestedFilename()).toBe("sales.csv")
  await expect(page.locator('[data-tid="generated-file-card"]')).toHaveCount(0)
})

test("window focus keeps the chat scroll position with a file card", async ({ page }) => {
  await setupTimeline(page, {
    seedHistory: true,
    viewport: { width: 1400, height: 700 },
    reducedMotion: true,
    messages: [
      userMessage(),
      assistantMessage([
        toolPart(
          "prt_focus_export_file",
          "loginom_dock_node_wait",
          "completed",
          { operation_id: "export" },
          {
            output: JSON.stringify({ state: "settled", status: "SUCCEEDED" }),
            metadata: {
              outputFiles: [{ artifact_id: "csv-1", path: "/private/download/result.csv", name: "result.csv" }],
            },
          },
        ),
        textPart("prt_focus_last", "Last answer after export"),
      ]),
    ],
  })
  const scroller = page.locator(".scroll-view__viewport", { has: page.locator("[data-timeline-row]") })
  await expect(page.locator('[data-tid="generated-file-card"]')).toHaveCount(1)
  await expect(page.getByText("Last answer after export", { exact: true })).toBeVisible()
  // The user scrolls up a little, keeping the file card on screen, before switching to another program.
  await scroller.hover()
  await page.mouse.wheel(0, -200)
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop))
    .toBeGreaterThan(100)
  await page.waitForTimeout(300)
  await expect(page.locator('[data-tid="generated-file-card"]')).toHaveCount(1)
  const position = await scroller.evaluate((element) => element.scrollTop)
  expect(position).toBeGreaterThan(0)
  await scroller.evaluate((element) => {
    element.dataset.detached = "0"
    new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.removedNodes) if (node.contains(element)) element.dataset.detached = "1"
    }).observe(document.body, { childList: true, subtree: true })
  })

  for (let round = 0; round < 3; round++) {
    await page.evaluate(() => {
      window.dispatchEvent(new Event("blur"))
      window.dispatchEvent(new Event("focus"))
    })
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  }
  await page.waitForTimeout(300)

  await expect(page.locator('[data-tid="generated-file-card"]')).toHaveCount(1)
  // The focus re-check must not suspend the page and remove the chat from the DOM.
  expect(await scroller.evaluate((element) => element.dataset.detached)).toBe("0")
  expect(await scroller.evaluate((element) => element.scrollTop)).toBe(position)
  await scroller.hover()
  await page.mouse.wheel(0, 20_000)
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop))
    .toBeLessThan(2)
  await expect(page.getByText("Last answer after export", { exact: true })).toBeVisible()
})

test("scrolling back down to a file card keeps the chat in the DOM", async ({ page }) => {
  await setupTimeline(page, {
    seedHistory: true,
    viewport: { width: 1400, height: 700 },
    reducedMotion: true,
    messages: [
      userMessage(),
      assistantMessage([
        toolPart(
          "prt_mount_export_file",
          "loginom_dock_node_wait",
          "completed",
          { operation_id: "export" },
          {
            output: JSON.stringify({ state: "settled", status: "SUCCEEDED" }),
            metadata: {
              outputFiles: [{ artifact_id: "csv-1", path: "/private/download/result.csv", name: "result.csv" }],
            },
          },
        ),
        textPart("prt_mount_last", "Last answer after export"),
      ]),
    ],
  })
  const scroller = page.locator(".scroll-view__viewport", { has: page.locator("[data-timeline-row]") })
  const card = page.locator('[data-tid="generated-file-card"]')
  await expect(card).toHaveCount(1)
  await scroller.hover()
  await page.mouse.wheel(0, -3000)
  await expect(card).toHaveCount(0)
  await scroller.evaluate((element) => {
    element.dataset.detached = "0"
    new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.removedNodes) if (node.contains(element)) element.dataset.detached = "1"
    }).observe(document.body, { childList: true, subtree: true })
  })

  // Scrolling down mounts the card again; its first file check must not remove the chat from the DOM.
  await page.mouse.wheel(0, 20_000)
  await expect(card).toHaveCount(1)
  await page.mouse.wheel(0, 20_000)
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop))
    .toBeLessThan(2)
  await expect(page.getByText("Last answer after export", { exact: true })).toBeVisible()
  expect(await scroller.evaluate((element) => element.dataset.detached)).toBe("0")
})
