import { expect, test, type Locator } from "@playwright/test"
import { sessionHref } from "../utils/app"
import { setupPackageChanges } from "../utils/loginom-package-changes"

function fact(table: Locator, name: string) {
  return table.getByRole("row").filter({ has: table.page().getByRole("rowheader", { name, exact: true }) })
}

for (const width of [1280, 390]) {
  test(`compares a package copy with its original from the conversation at ${width}px`, async ({ page }, testInfo) => {
    const { calls, card, sessionID, version } = await setupPackageChanges(page, { width, diagram: true })
    const tableName = "Настройки и связи"
    const port = "Вход «Входной источник данных»"
    const group = "Выручка по регионам"
    const added = "Проверка пустых значений"
    const removed = "Промежуточная выгрузка"
    const filter = "Фильтр по дате"
    const importer = "CSV продаж"

    await card.getByText("Изменённые узлы", { exact: true }).click()
    await card
      .getByRole("listitem")
      .filter({ has: page.getByText(group, { exact: true }).and(page.locator("strong")) })
      .getByText(tableName, { exact: true })
      .click()
    const fromCard = fact(card.getByRole("table", { name: tableName }), port)
    await expect(fromCard.getByRole("cell")).toHaveText([/← «CSV продаж»/, /← «Проверка пустых значений»/])
    const cardValues = await fromCard.getByRole("cell").allTextContents()
    const importRow = card
      .getByRole("listitem")
      .filter({ has: page.getByText(importer, { exact: true }).and(page.locator("strong")) })
    await importRow.getByText(tableName, { exact: true }).click()
    const file = (parent: Locator) => fact(parent.getByRole("table", { name: tableName }), "Имя файла/URL")
    const safeSource = "https://imports.example.invalid/sales.csv"
    const hiddenSource = /demo-user|demo-pass|fixture-query|fixture-fragment/
    await expect(file(importRow).getByRole("cell")).toContainText([safeSource, "Обновлённые продажи.csv"])
    await expect(card).not.toContainText(hiddenSource)

    await card.getByRole("button", { name: "Посмотреть на схеме" }).click()

    const schema = page
      .getByRole("main")
      .filter({ has: page.getByRole("heading", { name: "Изменения в «Продажи.lgp»" }) })

    const withChanges = schema.getByRole("button", { name: "С изменениями" })
    const asBefore = schema.getByRole("button", { name: "Как было" })
    const diagram = schema.getByRole("region", { name: "Схема пакета с изменениями" })
    const beforeDiagram = schema.getByRole("region", { name: "Схема пакета до изменений" })
    const table = schema.getByRole("table", { name: tableName })
    const node = (name: string) => diagram.getByRole("button", { name, exact: true })

    await expect(withChanges).toHaveAttribute("aria-pressed", "true")
    await expect(node(added)).toHaveAccessibleDescription("Новый")
    await expect(node(filter)).toHaveAccessibleDescription("Изменён")
    await expect(node(removed)).toHaveAccessibleDescription("Удалён")
    await expect(node(group)).toHaveAccessibleDescription("Изменён")

    if (width === 390) {
      await page.screenshot({ path: testInfo.outputPath("loginom-schema-diff-390-top.png"), animations: "disabled" })
    }

    await node(added).click()
    await expect(fact(table, "Условие").getByRole("cell")).toHaveText([/—/, /Выручка не пустое/])
    await node(removed).click()
    await expect(fact(table, "Вход «Источник данных»").getByRole("cell")).toHaveText([/← «Фильтр по дате»/, /—/])
    await node(filter).click()
    await expect(fact(table, "Условие").getByRole("cell")).toHaveText([/Выручка больше 0/, /Выручка больше 100/])
    await node(importer).click()
    await expect(file(schema).getByRole("cell")).toContainText([safeSource, "Обновлённые продажи.csv"])
    await expect(schema).not.toContainText(hiddenSource)
    await node(group).click()
    await expect(node(group)).toHaveAttribute("aria-pressed", "true")
    const inDiagram = fact(table, port)
    await expect(inDiagram.getByRole("cell")).toHaveText(cardValues)
    await expect(fact(table, "Группа").getByRole("cell")).toHaveText("Регион · не менялось")

    if (width === 390) {
      await expect.poll(() => diagram.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
      await expect(inDiagram.getByText("Было:", { exact: true })).toBeVisible()
      await expect(inDiagram.getByText("Стало:", { exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    }

    await page.screenshot({ path: testInfo.outputPath(`loginom-schema-diff-${width}.png`), animations: "disabled" })

    await asBefore.click()
    await expect(asBefore).toHaveAttribute("aria-pressed", "true")
    await expect(beforeDiagram.getByRole("button", { name: added })).toHaveCount(0)
    await expect(beforeDiagram.getByRole("button", { name: removed })).toBeVisible()
    await expect(beforeDiagram.getByRole("button", { name: group })).toHaveAttribute("aria-pressed", "true")
    await expect(table).toHaveCount(0)
    await expect(schema.getByText("← «CSV продаж»", { exact: true })).toBeVisible()
    await expect(schema.getByText("← «Проверка пустых значений»", { exact: true })).toHaveCount(0)
    await beforeDiagram.getByRole("button", { name: filter }).click()
    await expect(schema.getByText("Выручка > 0", { exact: true })).toBeVisible()
    await expect(schema.getByText("Выручка > 100", { exact: true })).toHaveCount(0)
    await beforeDiagram.getByRole("button", { name: importer, exact: true }).click()
    await expect(schema.getByText(safeSource, { exact: true })).toBeVisible()
    await expect(schema).not.toContainText(hiddenSource)

    await withChanges.click()
    await expect(node(importer)).toHaveAttribute("aria-pressed", "true")
    await schema.getByRole("button", { name: "Сохранить новой версией" }).click()
    await expect(schema.getByRole("status")).toHaveText("Сохранено новой версией: Продажи — v2.lgp")
    await schema.getByRole("button", { name: "Вернуться к разговору" }).click()
    await expect(page).toHaveURL(sessionHref(sessionID))
    await expect(card.getByRole("status")).toHaveText("Сохранено новой версией: Продажи — v2.lgp")
    await card.getByRole("button", { name: "Отменить сохранение" }).click()
    await expect(card.getByRole("button", { name: "Сохранить новой версией" })).toBeEnabled()
    expect(calls).toEqual([
      { method: "save-version", input: { sessionID } },
      { method: "undo-save", input: { sessionID, path: version } },
    ])
  })
}

for (const diagram of ["unrelated", "missing-lineage"] as const) {
  test(`uses recorded edits only when the saved diagrams have ${diagram} provenance`, async ({ page }) => {
    const { card } = await setupPackageChanges(page, { diagram })
    await card.getByText("Изменённые узлы", { exact: true }).click()
    await expect(card.getByText("Ручная правка", { exact: true })).toBeVisible()
    await expect(card.getByText("Проверка пустых значений", { exact: true })).toHaveCount(0)
    await expect(card.getByText("Промежуточная выгрузка", { exact: true })).toHaveCount(0)
    await expect(card.getByRole("button", { name: "Посмотреть на схеме" })).toHaveCount(0)
  })
}
