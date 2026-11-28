import { expect, test } from "@playwright/test"
import { openLoginomNodeConversation } from "../utils/loginom-schema"

test.use({ permissions: ["clipboard-read", "clipboard-write"] })

for (const width of [1280, 390]) {
  test(`copies the qualified node name and focuses the exact node in a submodel at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await openLoginomNodeConversation(page, { packageState: "saved", newTimeline: width === 1280 })
    const readClipboard = () => page.evaluate(() => navigator.clipboard.readText())
    const actions = page.getByRole("button", { name: "Действия шага" })
    await actions.click()
    await expect(page.getByRole("menuitem", { name: "Скопировать путь", exact: true })).toBeEnabled()
    await page.screenshot({ path: testInfo.outputPath(`loginom-step-menu-${width}.png`), animations: "disabled" })
    await page.getByRole("menuitem", { name: "Скопировать имя узла" }).click()
    await expect.poll(readClipboard).toBe("Продажи.lgp › Сценарий продаж › Контроль качества › Внутренняя проверка")
    await actions.click()
    await page.getByRole("menuitem", { name: "Скопировать путь" }).click()
    await expect.poll(readClipboard).toBe("/analyst/Пакеты/Продажи.lgp")

    await page.getByRole("button", { name: "Показать на схеме" }).click()
    await expect(page.getByText("Продажи.lgp › Сценарий продаж › Контроль качества", { exact: true })).toBeVisible()
    const graph = page.getByRole("region", { name: "Схема пакета", exact: true })
    const nodes = graph.getByRole("button", { name: "Внутренняя проверка", exact: true })
    await expect(nodes).toHaveCount(2)
    await expect(nodes.first()).toHaveAttribute("aria-pressed", "false")
    await expect(nodes.last()).toHaveAttribute("aria-pressed", "true")
    await expect(nodes.last()).toBeFocused()
    await expect(nodes.last()).toBeInViewport()
    await expect(page.getByRole("button", { name: "Скопировать путь" })).toBeEnabled()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await page.screenshot({ path: testInfo.outputPath(`loginom-node-links-${width}.png`), animations: "disabled" })

    await page.evaluate(() => navigator.clipboard.writeText(""))
    await page.getByRole("button", { name: "Скопировать путь" }).click()
    await expect.poll(readClipboard).toBe("/analyst/Пакеты/Продажи.lgp")
    await page.getByRole("button", { name: "Скопировать имя узла" }).click()
    await expect.poll(readClipboard).toBe("Продажи.lgp › Сценарий продаж › Контроль качества › Внутренняя проверка")
  })
}

test("opens the saved submodel from a step after returning to the parent workflow", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await openLoginomNodeConversation(page, { packageState: "saved", graph: "parent" })
  const graph = page.getByRole("region", { name: "Схема пакета", exact: true })
  const node = graph.getByRole("button", { name: "Внутренняя проверка", exact: true })
  await page.getByRole("button", { name: "Схема пакета", exact: true }).click()
  await expect(node).toHaveAttribute("aria-pressed", "false")
  await page.getByRole("button", { name: "Вернуться к разговору" }).click()

  await page.getByRole("button", { name: "Действия шага" }).click()
  await page.getByRole("menuitem", { name: "Скопировать путь", exact: true }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("/analyst/Пакеты/Продажи.lgp")

  await page.getByRole("button", { name: "Показать на схеме" }).click()
  await expect(page.getByText("Сохранённый файл", { exact: true })).toBeVisible()
  await expect(page.getByText("Продажи.lgp › Контроль качества", { exact: true })).toBeVisible()
  await expect(node).toHaveAttribute("aria-pressed", "true")
  await expect(node).toBeFocused()
})

test("requires saving before opening a departed submodel after an unsaved edit", async ({ page }) => {
  await openLoginomNodeConversation(page, { packageState: "dirty", graph: "parent" })
  await page.getByRole("button", { name: "Показать на схеме" }).click()
  await expect(page.getByRole("status").filter({ hasText: "Сохраните пакет и попробуйте снова." })).toBeVisible()
  await expect(page.getByRole("button", { name: "Внутренняя проверка", exact: true })).toHaveCount(0)
})

test("offers no path for an unsaved draft", async ({ page }) => {
  await openLoginomNodeConversation(page, { packageState: "draft" })
  await page.evaluate(() => navigator.clipboard.writeText("нет пути"))
  await page.getByRole("button", { name: "Действия шага" }).click()
  await expect(page.getByRole("menuitem", { name: "Скопировать путь", exact: true })).toBeDisabled()
  await page.keyboard.press("Escape")
  await page.getByRole("button", { name: "Показать на схеме" }).click()
  await expect(page.getByText("Путь пакета недоступен")).toBeVisible()
  await expect(page.getByRole("button", { name: "Скопировать путь" })).toBeDisabled()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("нет пути")
})

for (const packageState of ["dirty", "resaved"] as const) {
  test(packageState === "resaved" ? "copies the latest window path after manual Save As" : "marks the last saved path for a dirty package", async ({ page }) => {
    const conversation = await openLoginomNodeConversation(page, {
      packageState: packageState === "resaved" ? "saved" : "dirty",
    })

    const path = packageState === "dirty" ? "/analyst/Пакеты/Продажи.lgp" : "/analyst/Пакеты/Продажи — версия 2.lgp"
    const readClipboard = () => page.evaluate(() => navigator.clipboard.readText())

    await page.getByRole("button", { name: "Действия шага" }).click()
    const menuPath = page.getByRole("menuitem", { name: /^Скопировать путь/ })

    if (packageState === "resaved") {
      await menuPath.click()
      await expect.poll(readClipboard).toBe("/analyst/Пакеты/Продажи.lgp")
      conversation.resave()
      await page.getByRole("button", { name: "Действия шага" }).click()
    }

    await expect(menuPath).toBeEnabled()
    await expect(menuPath.getByText("Путь последнего сохранения")).toHaveCount(packageState === "dirty" ? 1 : 0)
    await menuPath.click()
    await expect.poll(readClipboard).toBe(path)

    await page.getByRole("button", { name: "Показать на схеме" }).click()
    await expect(page.getByText(path, { exact: true })).toBeVisible()
    await expect(page.getByText("Путь последнего сохранения", { exact: true })).toHaveCount(
      packageState === "dirty" ? 1 : 0,
    )
    await page.evaluate(() => navigator.clipboard.writeText(""))
    await page.getByRole("button", { name: "Скопировать путь" }).click()
    await expect.poll(readClipboard).toBe(path)
  })
}

for (const [graph, message] of [
  ["removed", "Узел удалён из этой схемы."],
  ["other", "Для этого шага доступен только другой снимок схемы."],
] as const) {
  test(`reports a node reference with graph state ${graph} without selecting a namesake`, async ({ page }) => {
    await openLoginomNodeConversation(page, { packageState: "saved", graph })

    if (graph === "other") {
      await page.getByRole("button", { name: "Действия шага" }).click()
      await expect(page.getByRole("menuitem", { name: "Скопировать путь", exact: true })).toBeDisabled()
      await page.keyboard.press("Escape")
    }

    await page.getByRole("button", { name: "Показать на схеме" }).click()
    await expect(page.getByRole("status").filter({ hasText: message })).toBeVisible()
    await expect(page.getByRole("button", { name: "Внутренняя проверка", exact: true })).toHaveCount(0)
  })
}
