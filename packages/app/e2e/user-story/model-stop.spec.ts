import { expect, test } from "@playwright/test"
import type { SessionMessageInfo } from "@opencode/client/promise"
import { provider } from "../utils/app"
import { openSession } from "../utils/workspace"

test.use({ locale: "ru-RU", timezoneId: "UTC", video: "off" })

const model = { providerID: "opencode", id: "free-test" }

const sessionID = "ses_model_stop"

function history(type: string, created: number): SessionMessageInfo[] {
  const error = { type, message: "Test provider refused the request", status: 429, retryAfterMs: 3_600_000 }

  return [
    { type: "user", id: "msg_001", time: { created }, text: "Обработай таблицу" },
    {
      type: "assistant",
      id: "msg_002",
      time: { created, completed: created },
      model,
      agent: "build",
      content: [{ type: "text", text: "Таблица прочитана." }],
      finish: "stop",
    },
    {
      type: "assistant",
      id: "msg_003",
      time: { created, completed: created },
      model,
      agent: "build",
      content: [],
      finish: "error",
      error,
    },
    { type: "idle", id: "msg_004", time: { created }, outcome: "failed", error },
  ]
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`continues after the free limit at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    const now = new Date("2026-11-27T02:00:00Z")
    await page.clock.setFixedTime(now)
    const messages = history("provider.free-limit", now.getTime())
    await openSession(page, {
      name: "Лимит модели",
      sessions: [{ id: sessionID, title: "Обработка таблицы", model, outcome: "failed" }],
      provider: provider({ id: model.id, name: "Бесплатная модель" }, { id: "second-test", name: "Вторая модель" }),
      pageMessages: () => ({ items: messages }),
    })

    const stop = page.locator('[data-component="model-stop"]')
    await expect(stop).toContainText("Ход остановлен: дневной лимит исчерпан")
    await expect(stop).toContainText("Лимит обновится в 03:00")
    await expect(page.getByText("Таблица прочитана.")).toBeVisible()
    await expect(page.getByText("Лимит на сегодня исчерпан — обновится в 03:00")).toBeVisible()
    await expect(stop.getByRole("button", { name: "Продолжить с этой же" })).toHaveCount(0)
    await stop.getByText("Продолжить с другой моделью").click()
    await expect(stop.getByRole("button", { name: "Бесплатная модель" })).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath(`model-stop-${viewport.width}.png`) })

    const switched = page.waitForRequest(
      (request) => request.method() === "POST" && new URL(request.url()).pathname === `/api/session/${sessionID}/model`,
    )

    const continued = page.waitForRequest(
      (request) => request.method() === "POST" && new URL(request.url()).pathname.endsWith("/prompt"),
    )

    await stop.getByRole("button", { name: "Вторая модель" }).click()
    expect((await switched).postDataJSON()).toMatchObject({ model: { providerID: "opencode", id: "second-test" } })
    expect((await continued).postDataJSON()).toMatchObject({ metadata: { modelContinuation: "Вторая модель" } })
    await expect(page.getByText("Вы продолжили с моделью «Вторая модель»")).toBeVisible()
  })
}

for (const [type, reason, same] of [
  ["provider.quota", "закончились средства", false],
  ["provider.auth", "ключ не подошёл", false],
  ["provider.no-route", "модель недоступна", true],
  ["provider.invalid-request", "запрос отклонён", true],
  ["provider.context-overflow", "Разговор не помещается в модель", true],
] as const) {
  test(`shows the recovery options for ${type}`, async ({ page }) => {
    await openSession(page, {
      name: "Сбой модели",
      sessions: [{ id: sessionID, title: "Обработка таблицы", model, outcome: "failed" }],
      provider: provider({ id: model.id, name: "Тестовая модель" }),
      pageMessages: () => ({ items: history(type, Date.now()) }),
    })
    const stop = page.locator('[data-component="model-stop"]')
    await expect(stop).toContainText(`Ход остановлен: ${reason}`)
    await expect(stop.getByRole("button", { name: "Подключить модель" })).toBeVisible()
    await expect(stop.getByRole("button", { name: "Скопировать текст ошибки" })).toBeVisible()
    await expect(stop.getByRole("button", { name: "Продолжить с этой же" })).toHaveCount(same ? 1 : 0)
  })
}

test("shows a completed compaction in the timeline", async ({ page }) => {
  const messages: SessionMessageInfo[] = [
    { type: "user", id: "msg_001", time: { created: Date.now() }, text: "Обработай таблицу" },
    {
      type: "compaction",
      id: "msg_002",
      time: { created: Date.now() },
      status: "completed",
      reason: "auto",
      summary: "Таблица прочитана.",
    },
  ]

  await openSession(page, {
    name: "Сжатие",
    sessions: [{ id: sessionID, title: "Обработка таблицы", model }],
    pageMessages: () => ({ items: messages }),
  })
  await expect(
    page.getByText("Сжал начало разговора — дальше агент помнит его кратко", { exact: true }).first(),
  ).toBeVisible()
})
