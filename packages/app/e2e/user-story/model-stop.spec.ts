import { expect, test } from "@playwright/test"
import type { OpenCodeEvent, SessionMessageAssistant, SessionMessageInfo } from "@opencode/client/promise"
import { provider, sessionHref } from "../utils/app"
import { openSession } from "../utils/workspace"

test.use({ locale: "ru-RU", timezoneId: "UTC", video: "off" })

const model = { providerID: "opencode", id: "free-test" }

const sessionID = "ses_model_stop"
const narrowViewport = { width: 390, height: 844 }

function history(
  type: string,
  created: number,
  details?: Partial<NonNullable<SessionMessageAssistant["error"]>>,
): SessionMessageInfo[] {
  const error = { type, message: "Test provider refused the request", status: 429, retryAfterMs: 3_600_000, ...details }

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

for (const viewport of [{ width: 1440, height: 900 }, narrowViewport]) {
  test(`continues after the free limit at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    const now = new Date("2026-11-27T02:00:00Z")
    await page.clock.setFixedTime(now)
    const messages = history("provider.free-limit", now.getTime())
    const requests: string[] = []
    page.on("request", (request) => {
      const action = new URL(request.url()).pathname.match(`/api/session/${sessionID}/(model|prompt)$`)?.[1]

      if (request.method() === "POST" && action) requests.push(action)
    })
    const second = { providerID: "opencode", id: "second-test" }
    const { push, session } = await openSession(page, {
      name: "Лимит модели",
      sessions: [{ id: sessionID, title: "Обработка таблицы", model, outcome: "failed" }],
      provider: provider(
        { id: model.id, name: "Бесплатная модель" },
        { id: second.id, name: "Вторая модель" },
        { id: "hidden-test", name: "Скрытая модель" },
      ),
      seed: {
        settings: { general: { newTimeline: viewport.width === 1440 } },
        storage: {
          "opencode.global.dat:model": {
            user: [{ providerID: "opencode", modelID: "hidden-test", visibility: "hide" }],
            recent: [],
            variant: {},
          },
        },
      },
      pageMessages: (_id, limit, _before, type) => ({
        items: messages.filter((message) => !type || message.type === type).slice(-limit),
      }),
    })

    const stop = page.locator('[data-component="model-stop"]')
    await expect(stop).toContainText("Ход остановлен: дневной лимит исчерпан")
    await expect(stop).toContainText("Лимит обновится в 03:00")
    await expect(page.getByText("Таблица прочитана.")).toBeVisible()
    await expect(page.getByText("Лимит на сегодня исчерпан — обновится в 03:00")).toBeVisible()
    await expect(stop.getByRole("button", { name: "Продолжить с этой же" })).toHaveCount(0)
    await stop.getByText("Продолжить с другой моделью").click()
    await expect(stop.getByRole("button", { name: "Бесплатная модель" })).toHaveCount(0)
    await expect(stop.getByRole("button", { name: "Скрытая модель" })).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath(`model-stop-${viewport.width}.png`) })

    const switched = page.waitForRequest(
      (request) => request.method() === "POST" && new URL(request.url()).pathname === `/api/session/${sessionID}/model`,
    )

    const continued = page.waitForRequest(
      (request) => request.method() === "POST" && new URL(request.url()).pathname.endsWith("/prompt"),
    )

    await stop.getByRole("button", { name: "Вторая модель" }).click()
    expect((await switched).postDataJSON()).toMatchObject({ model: second })
    const prompt = (await continued).postDataJSON()
    expect(prompt).toMatchObject({ metadata: { modelContinuation: "Вторая модель" } })
    await expect(page.getByText("Вы продолжили с моделью «Вторая модель»")).toBeVisible()

    const created = now.getTime() + 1000
    const assistantMessageID = "msg_model_stop_resumed"
    const answer = "Обработка завершена."
    const event = (seq: number) => ({
      id: `evt_model_stop_${seq}`,
      created: created + seq,
      durable: { aggregateID: sessionID, seq, version: 1 as const },
    })

    Object.assign(session, { outcome: "succeeded" })
    await push([
      { ...event(1), type: "session.inbox.delivered", data: { sessionID, inboxID: prompt.id } },
      { ...event(2), type: "session.execution.started", data: { sessionID } },
      {
        ...event(3),
        type: "session.step.started",
        data: { sessionID, assistantMessageID, agent: "build", model: second, started: created },
      },
      { ...event(4), type: "session.text.started", data: { sessionID, assistantMessageID, ordinal: 0 } },
      { ...event(5), type: "session.text.ended", data: { sessionID, assistantMessageID, ordinal: 0, text: answer } },
      {
        ...event(6),
        type: "session.step.ended",
        data: {
          sessionID,
          assistantMessageID,
          finish: "stop",
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        },
      },
      { ...event(7), type: "session.execution.succeeded", data: { sessionID } },
    ] satisfies OpenCodeEvent[])

    await expect(page.getByText(answer, { exact: true })).toBeVisible()
    await expect(stop).toContainText("Ход остановлен: дневной лимит исчерпан")
    await expect(stop.getByText("Продолжить с другой моделью")).toHaveCount(0)
    await expect(stop.getByRole("button", { name: "Продолжить с этой же" })).toHaveCount(0)
    expect(requests).toEqual(["model", "prompt"])
  })
}

for (const [type, reason, same] of [
  ["provider.quota", "закончились средства", false],
  ["provider.auth", "ключ не подошёл", false],
  ["provider.no-route", "модель недоступна", true],
  ["provider.invalid-request", "запрос отклонён", true],
] as const) {
  test(`shows the recovery options for ${type}: ${reason}`, async ({ page }) => {
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

test("offers another model when the context overflows at 390px", async ({ page }, testInfo) => {
  await page.setViewportSize(narrowViewport)
  const messages = history("provider.invalid-request", Date.now(), {
    status: 400,
    message: "Please reduce the length of the messages",
  })
  await openSession(page, {
    name: "Длинный разговор",
    sessions: [{ id: sessionID, title: "Обработка таблицы", model, outcome: "failed" }],
    provider: provider({ id: model.id, name: "Тестовая модель" }, { id: "large-test", name: "Модель с большим окном" }),
    pageMessages: (_id, limit, _before, type) => ({
      items: messages.filter((message) => !type || message.type === type).slice(-limit),
    }),
  })

  const stop = page.locator('[data-component="model-stop"]')
  const warning = "Разговор не помещается в модель — начните новый разговор или выберите модель с большим окном"
  await expect(stop.getByRole("status")).toContainText(warning)
  await expect(stop.getByRole("button", { name: "Продолжить с этой же" })).toHaveCount(0)
  await expect(stop.getByRole("button", { name: "Скопировать текст ошибки" })).toBeVisible()
  await stop.getByText("Продолжить с другой моделью", { exact: true }).click()
  await expect(stop.getByRole("button", { name: "Модель с большим окном" })).toBeVisible()
  await expect(stop.getByRole("button", { name: "Тестовая модель" })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath("context-overflow-390.png") })
})

for (const backgroundCompaction of [false, true]) {
  test(`shows the full ${backgroundCompaction ? "background" : "regular"} compaction notice at 390px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(narrowViewport)
    const messages: SessionMessageInfo[] = [
      { type: "user", id: "msg_001", time: { created: Date.now() }, text: "Обработай таблицу" },
      {
        type: "compaction",
        id: "msg_002",
        time: { created: Date.now() - 5000 },
        status: "completed",
        reason: "auto",
        summary: "Таблица прочитана.",
      },
    ]

    await openSession(page, {
      name: "Сжатие",
      sessions: [{ id: sessionID, title: "Обработка таблицы", model }],
      configEntries: [{ type: "document", info: { experimental: { background_compaction: backgroundCompaction } } }],
      seed: { settings: { general: { newTimeline: backgroundCompaction } } },
      pageMessages: () => ({ items: messages }),
    })

    const compaction = page.locator('[data-component="session-compaction-message"]')
    const text = "Сжал начало разговора — дальше агент помнит его кратко"
    if (backgroundCompaction) await compaction.getByRole("button", { name: text }).click()
    const notice = compaction.getByText(text, { exact: true })
    await expect(compaction.getByText("Таблица прочитана.", { exact: true })).toBeVisible()
    await expect(compaction.getByText("Начата компактизация сессии", { exact: true })).toHaveCount(0)
    await expect(notice).toHaveCount(1)
    await expect(notice).toBeInViewport({ ratio: 1 })
    await expect
      .poll(() =>
        notice.evaluate((element) => {
          const box = element.getBoundingClientRect()
          const textRange = document.createRange()
          textRange.selectNodeContents(element)
          return Array.from(textRange.getClientRects()).every(
            (line) => line.left >= box.left - 1 && line.right <= box.right + 1,
          )
        }),
      )
      .toBe(true)
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath(`compaction-${backgroundCompaction ? "background" : "regular"}-390.png`),
    })
  })
}

for (const tabLayout of ["horizontal", "vertical"]) {
  test(`marks a model stop without opening its history in ${tabLayout} layout`, async ({ page }) => {
    const failedTitle = "Model failed"
    const failedID = "ses_model_stop_unopened"
    const failed = history("provider.quota", Date.now())
    const reads: { type: string | undefined; limit: number }[] = []

    await openSession(page, {
      name: "Model stop project",
      sessions: [
        { id: sessionID, title: "Open session", model },
        { id: failedID, title: failedTitle, model, outcome: "failed" },
      ],
      seed: { settings: { appearance: { tabLayout, sidebarOpen: true }, general: { sidebarOrganize: "projects" } } },
      pageMessages: (id, limit, _before, type) => {
        if (id !== failedID) return { items: [] }
        reads.push({ type, limit })
        return { items: failed.filter((message) => !type || message.type === type).slice(-limit) }
      },
    })

    if (tabLayout === "horizontal") {
      const tab = page.locator(`[data-titlebar-tab]:has(a[href="${sessionHref(failedID)}"])`)
      await expect(tab).toHaveAttribute("data-status", "model-stopped")
      await expect(tab).toHaveAttribute("aria-description", "Модель не ответила")
      await expect(tab.locator('[data-mark="model-stopped"]')).toBeVisible()
    } else {
      const project = page.getByRole("complementary").getByRole("button", { name: /Model stop project/ })
      const row = page.locator(`button[data-titlebar-tab-action][title="${failedTitle}"]`)

      if ((await project.getAttribute("aria-expanded")) !== "true") await project.click()
      await expect(row).toHaveAttribute("aria-description", "Модель не ответила")
      await expect(row.locator(".bg-v2-state-fg-warning")).toBeVisible()
    }

    expect(reads.length).toBeGreaterThan(0)
    expect(reads.every((read) => read.type === "idle" && read.limit === 1)).toBe(true)
  })
}

test("shows the product retry countdown in the app timeline", async ({ page }) => {
  const now = Date.now()
  await page.clock.setFixedTime(now)
  await openSession(page, {
    name: "Model retry",
    sessions: [{ id: sessionID, title: "Retry session", model, time: { created: now, updated: now, busy: now } }],
    pageMessages: () => ({
      items: [
        { type: "user", id: "msg_retry_user", time: { created: now }, text: "Обработай таблицу" },
        {
          type: "assistant",
          id: "msg_retry_assistant",
          time: { created: now },
          model,
          agent: "build",
          content: [],
          retry: { attempt: 2, at: now + 15_000, error: { type: "provider.error", message: "Rate limited" } },
        },
      ],
    }),
  })

  const retry = page.locator('[data-slot="session-turn-retry"]')
  await expect(retry).toContainText("Модель занята — повторю через 15 с · попытка 2")
  await expect(retry.locator('[data-kind="session-retry-card"]')).toHaveCount(0)
})
