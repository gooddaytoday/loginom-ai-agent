import { expect, test } from "@playwright/test"
import { openLoginomSchemaConversation, packageFinding } from "../utils/loginom-schema"
import { sessionHref } from "../utils/app"

for (const width of [1280, 390]) {
  test(`a finding opens the saved Loginom diagram and returns to the conversation at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    const conversation = await openLoginomSchemaConversation(page, "saved")
    await page.getByRole("button", { name: "Показать на схеме" }).click()
    await expect(page.getByRole("heading", { name: "Продажи.lgp" })).toBeVisible()
    await expect(page.getByText("Сохранённый файл")).toBeVisible()
    const graph = page.getByRole("region", { name: "Схема пакета", exact: true })
    const filter = graph.getByRole("button", { name: "Фильтр продаж" })
    const group = graph.getByRole("button", { name: "Итоги по регионам" })
    const csv = graph.getByRole("button", { name: "CSV продаж" })
    const unpositioned = graph.getByRole("button", { name: "Без координат" })
    await expect(filter).toHaveAttribute("aria-pressed", "true")
    await expect(filter.getByText("Замечание", { exact: true })).toBeVisible()
    await expect(group.getByText("Замечание", { exact: true })).toBeVisible()
    await expect(page.getByText(packageFinding, { exact: false })).toBeVisible()
    await expect(page.getByText("Узел Loginom", { exact: true })).toBeVisible()
    await expect(page.getByText("Выручка > 0", { exact: true })).toBeVisible()
    await expect(page.getByText("← «CSV продаж»", { exact: true })).toBeVisible()
    await expect(page.getByText("→ «Итоги по регионам»", { exact: true })).toBeVisible()
    await expect(page.getByText("Выход «Не соответствуют условию»").locator("..")).toContainText("не подключён")
    await expect(graph.locator('[data-slot="diagram-links"] path')).toHaveCount(3)
    const coordinates = await Promise.all([csv, filter, group, unpositioned].map((node) => node.boundingBox()))
    const [csvBox, filterBox, groupBox, fallbackBox] = coordinates
    expect(filterBox!.x - csvBox!.x).toBe(235)
    expect(groupBox!.y - filterBox!.y).toBe(-40)
    expect(fallbackBox!.x).toBeGreaterThan(groupBox!.x)

    if (width === 390) {
      await expect(page.getByText("Прокрутите схему вбок", { exact: false })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    }

    await page.screenshot({ path: testInfo.outputPath(`loginom-schema-${width}.png`) })

    await csv.click()
    await expect(page.getByRole("heading", { name: "CSV продаж" })).toBeVisible()
    await expect(page.getByText("Имя файла/URL", { exact: true })).toHaveCount(0)
    await expect(page.getByText("sales.csv", { exact: true })).toHaveCount(0)
    await expect(page.getByText("Вход «Подключение»", { exact: true })).toHaveCount(0)
    await expect(page.getByText("Вход «Управляющие переменные»", { exact: true })).toHaveCount(0)
    await expect(page.getByText("Разделитель столбцов", { exact: true })).toHaveCount(0)
    await group.click()
    await expect(page.getByText("Группа", { exact: true }).locator("..")).toContainText("Регион")
    await expect(page.getByText("Показатели", { exact: true }).locator("..")).toContainText("Выручка · Сумма")
    await expect(filter.getByText("Замечание", { exact: true })).toBeVisible()
    await graph.getByRole("button", { name: "Контроль качества" }).click()
    await page.getByRole("button", { name: "Войти в подмодель" }).click()
    await expect(page.getByText("Продажи.lgp › Контроль качества", { exact: true })).toBeVisible()
    await expect(page.getByText("Вход подмодели", { exact: true })).toBeVisible()
    await expect(page.getByText("Выход подмодели", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Внутренняя проверка" }).click()
    await expect(page.getByText("← «Вход подмодели»", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Выйти из подмодели" }).click()
    await expect(graph.getByRole("button", { name: "Контроль качества" })).toHaveAttribute("aria-pressed", "true")

    await page.getByRole("button", { name: "Вернуться к разговору" }).click()
    await expect(page).toHaveURL(sessionHref(conversation.session.id))
    await expect(page.getByRole("button", { name: "Показать на схеме" })).toBeVisible()

    if (width === 390) {
      await page.getByRole("button", { name: "Schema", exact: true }).click()
      await page.getByRole("menuitem", { name: "Схема пакета" }).click()
    } else {
      await page.getByRole("button", { name: "Схема пакета" }).click()
    }

    await expect(filter).toHaveAttribute("aria-pressed", "false")
    await expect(graph.getByText("Замечание", { exact: true })).toHaveCount(0)
    await unpositioned.click()
    await expect(page.getByRole("heading", { name: "Без координат" })).toBeVisible()
    await expect(page.getByText("Имя файла/URL", { exact: true })).toHaveCount(0)
    await expect(page.getByText("Разделитель столбцов", { exact: true })).toHaveCount(0)
  })
}

test("the Loginom window snapshot shows only the active workflow", async ({ page }) => {
  await openLoginomSchemaConversation(page, "window")
  await page.getByRole("button", { name: "Схема пакета" }).click()
  await expect(page.getByText("Из окна Loginom", { exact: true })).toBeVisible()
  await expect(page.getByText("Пакет из окна Loginom › Модуль › Сценарий", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Контроль качества" }).click()
  await expect(page.getByText("Содержимое видно после сохранения пакета", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Войти в подмодель" })).toHaveCount(0)
})
