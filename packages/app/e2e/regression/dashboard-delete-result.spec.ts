import { expect, test } from "@playwright/test"
import { assistantMessage, setupTimeline, toolPart, userMessage } from "../performance/timeline-stability/fixture"

test("shows a completed dashboard deletion in the chat history", async ({ page }) => {
  const output = "Дашборд удалён. Опубликованных версий и локального черновика больше нет."
  await setupTimeline(page, {
    messages: [userMessage(), assistantMessage([toolPart("prt_dashboard_delete", "dashboard_delete", "completed", {}, { output })])],
  })
  await expect(page.getByText(output, { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText(output, { exact: true })).toBeVisible()
})

test("shows partial deletion and cancellation without reporting full success", async ({ page }) => {
  const partial = "Подтверждено удаление версий: 1. Локальный черновик сохранён."
  const cancelled = "Дальнейшее удаление отменено."
  await setupTimeline(page, {
    messages: [userMessage(), assistantMessage([
      toolPart("prt_partial", "dashboard_delete", "completed", {}, { output: partial, metadata: { isError: true } }),
      toolPart("prt_cancelled", "dashboard_delete", "error", {}, { error: cancelled }),
    ])],
  })
  await expect(page.getByText(partial, { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "dashboard_delete Failed" }).click()
  await expect(page.getByText(cancelled, { exact: true })).toBeVisible()
  await expect(page.getByText("Дашборд удалён. Опубликованных версий и локального черновика больше нет.")).toHaveCount(0)
})
