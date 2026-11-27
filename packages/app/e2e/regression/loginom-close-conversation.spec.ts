import { expect, test, type Page } from "@playwright/test"
import { SERVER, sessionHref } from "../utils/app"
import { expectSessionTitle } from "../utils/waits"
import { mockWorkspace } from "../utils/workspace"

const conversation = { id: "ses_loginom_close", title: "Импорт продаж" }

const other = { id: "ses_loginom_other", title: "Отчёт по продажам" }

const path = "/user/sales.lgp"

const packageRPC = "/api/rpc/loginom.package-state"

type State = "absent" | "clean" | "dirty"

async function openConversation(page: Page, state: State, saveResult: "saved" | "blocked" | "no-receipt" = "saved") {
  const { sessions, directory } = await mockWorkspace(page, {
    name: "Loginom",
    sessions: [conversation, other],
    seed: { locale: "ru" },
  })

  const record = sessions.find((item) => item.id === conversation.id)

  if (!record) throw new Error("Missing fixture conversation")
  const snapshots: string[] = []
  const decisions: string[] = []
  const releaseSave = Promise.withResolvers<void>()
  const removeRequests: string[] = []

  page.on("request", (request) => {
    if (request.method() === "DELETE" && new URL(request.url()).pathname === `/api/session/${conversation.id}`)
      removeRequests.push(request.url())
  })

  await page.route(
    (url) => url.origin === SERVER && url.pathname.startsWith(packageRPC),
    async (route) => {
      const request = route.request()

      if (request.method() !== "POST") return route.fallback()

      const method = new URL(request.url()).pathname.split("/").pop()
      const location = new URL(request.url()).searchParams.get("location[directory]")
      expect(location).toBe(directory)
      const body = request.postDataJSON()
      const headers = { "access-control-allow-origin": "*" }

      if (method === "snapshot") {
        expect(body).toEqual({ input: { sessionID: conversation.id } })
        snapshots.push(conversation.id)

        return route.fulfill({
          headers,
          json: {
            output: {
              open: state !== "absent",
              path: state === "absent" ? null : path,
              modified: state === "absent" ? null : state === "dirty",
              modifiedDetectedAt: state === "dirty" ? 100 : null,
              lastSave: null,
            },
          },
        })
      }

      expect(method).toBe("close")
      const decision: unknown = body.input?.decision
      expect(body).toEqual({ input: { sessionID: conversation.id, path, decision } })

      if (decision !== "save" && decision !== "discard" && decision !== "clean")
        throw new Error("Unknown package decision")

      decisions.push(decision)

      if (decision === "save") {
        await releaseSave.promise

        if (saveResult === "blocked") return route.fulfill({ headers, json: { output: { status: "blocked" } } })

        if (saveResult === "no-receipt") return route.fulfill({ headers, json: { output: { status: "closed" } } })
        const lastSave = { path, confirmedAt: 101 }
        Object.assign(record, { metadata: { loginom: { lastSave, lastClose: { decision, path } } } })

        return route.fulfill({ headers, json: { output: { status: "closed", lastSave } } })
      }

      if (decision === "discard") Object.assign(record, { metadata: { loginom: { lastClose: { decision } } } })

      return route.fulfill({ headers, json: { output: { status: "closed" } } })
    },
  )

  await page.goto(sessionHref(conversation.id))
  await expectSessionTitle(page, conversation.title)

  return { snapshots, decisions, releaseSave, removeRequests }
}

const dialog = (page: Page) => page.getByRole("dialog", { name: "Закрыть разговор?" })

const tab = (page: Page) => page.locator(`[data-titlebar-tab-slot]:has(a[href="${sessionHref(conversation.id)}"])`)

const closeByShortcut = (page: Page) => page.keyboard.press("Control+Alt+w")

for (const width of [1280, 390]) {
  test(`offers the prototype choices and cancels closing at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 })
    const fixture = await openConversation(page, "dirty")
    await closeByShortcut(page)
    const prompt = dialog(page)

    await expect(prompt).toBeVisible()
    await expect(prompt).toContainText("Пакет «sales.lgp» в разговоре «Импорт продаж» не сохранён.")
    const buttons = prompt.getByRole("button")
    await expect(buttons).toHaveText(["Сохранить в Loginom", "Закрыть без сохранения", "Отмена"])

    for (const button of await buttons.all()) {
      await expect(button).toBeInViewport({ ratio: 1 })
    }

    await page.screenshot({ path: info.outputPath(`loginom-close-${width}.png`) })

    if (width === 390) await page.keyboard.press("Escape")
    else await prompt.getByRole("button", { name: "Отмена" }).click()

    await expect(prompt).toBeHidden()
    await expect(page).toHaveURL(sessionHref(conversation.id))
    expect(fixture.snapshots).toEqual([conversation.id])
    expect(fixture.decisions).toEqual([])
  })
}

test("waits for the Save receipt, closes the tab, and shows the decision when reopened", async ({ page }) => {
  const fixture = await openConversation(page, "dirty")
  await tab(page).getByRole("button", { name: "Закрыть вкладку", exact: true }).click()
  await dialog(page).getByRole("button", { name: "Сохранить в Loginom" }).click()
  await expect.poll(() => fixture.decisions).toEqual(["save"])
  await expect(page).toHaveURL(sessionHref(conversation.id))
  await expect(dialog(page).getByRole("status")).toBeVisible()

  fixture.releaseSave.resolve()
  await expect(page).toHaveURL(sessionHref(other.id))
  await expect(tab(page)).toHaveCount(0)
  await page.goto(sessionHref(conversation.id))
  await expect(page.getByText("Вы сохранили «sales.lgp» перед закрытием")).toBeVisible()
})

test("closes without saving and shows that decision when reopened", async ({ page }) => {
  const fixture = await openConversation(page, "dirty")
  await closeByShortcut(page)
  await dialog(page).getByRole("button", { name: "Закрыть без сохранения" }).click()
  await expect(page).toHaveURL(sessionHref(other.id))
  expect(fixture.decisions).toEqual(["discard"])
  await page.goto(sessionHref(conversation.id))
  await expect(page.getByText("Закрыто без сохранения", { exact: true })).toBeVisible()
})

for (const state of ["absent", "clean"] as const) {
  test(`closes without a question when the package is ${state}`, async ({ page }) => {
    const fixture = await openConversation(page, state)
    await closeByShortcut(page)
    await expect(page).toHaveURL(sessionHref(other.id))
    await expect(dialog(page)).toHaveCount(0)
    expect(fixture.snapshots).toEqual([conversation.id])
    expect(fixture.decisions).toEqual(state === "clean" ? ["clean"] : [])
  })
}

for (const result of ["blocked", "no-receipt"] as const) {
  test(`keeps the tab open with a visible Save error on ${result}`, async ({ page }) => {
    const fixture = await openConversation(page, "dirty", result)
    await closeByShortcut(page)
    await dialog(page).getByRole("button", { name: "Сохранить в Loginom" }).click()
    fixture.releaseSave.resolve()

    await expect(page.getByText("Не удалось подтвердить сохранение и закрытие пакета в Loginom.")).toBeVisible()
    await expect(page.getByText("Разговор остался открыт.")).toBeVisible()
    await expect(page).toHaveURL(sessionHref(conversation.id))
    await expect(tab(page)).toBeVisible()
    expect(fixture.decisions).toEqual(["save"])
  })
}

test("deletes a conversation only after accepting the unsaved package decision", async ({ page }) => {
  const fixture = await openConversation(page, "dirty")

  const requestDeletion = async () => {
    await page.getByRole("button", { name: "Дополнительные опции", exact: true }).click()
    await page.getByRole("menuitem", { name: "Удалить…", exact: true }).click()
    await page.getByRole("dialog", { name: "Удалить сессию" }).getByRole("button", { name: "Удалить сессию" }).click()
  }

  await requestDeletion()
  await dialog(page).getByRole("button", { name: "Отмена" }).click()
  await expect(dialog(page)).toBeHidden()
  expect(fixture.removeRequests).toHaveLength(0)
  expect(fixture.decisions).toEqual([])
  await expect(page).toHaveURL(sessionHref(conversation.id))

  await page.getByRole("dialog", { name: "Удалить сессию" }).getByRole("button", { name: "Удалить сессию" }).click()
  await dialog(page).getByRole("button", { name: "Закрыть без сохранения" }).click()
  await expect.poll(() => fixture.removeRequests.length).toBe(1)
  expect(fixture.decisions).toEqual(["discard"])
  await expect(tab(page)).toHaveCount(0)
})
