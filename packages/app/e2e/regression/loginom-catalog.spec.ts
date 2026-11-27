import { expect, test } from "@playwright/test"
import { mockWorkspace } from "../utils/workspace"

const mockModel = {
  all: [{ id: "test", name: "Test", models: { catalog: { id: "catalog", name: "Catalog test" } } }],
  connected: ["test"],
  default: { providerID: "test", modelID: "catalog" },
}

test("the catalog filters bundled skills and resets filters when switching sections", async ({ page }) => {
  await mockWorkspace(page, {
    name: "Catalog",
    seed: { locale: "ru" },
    provider: mockModel,
  })
  await page.goto("/")
  const nav = page.getByRole("navigation").getByRole("button", { name: "Каталог", exact: true })
  await nav.click()

  const cards = page.getByRole("article")
  const search = page.getByRole("searchbox", { name: "Поиск в каталоге" })
  const tiers = page.getByRole("group", { name: "Кто подготовил" })
  const types = page.getByRole("group", { name: "Тип", exact: true })

  await expect(page.getByRole("heading", { name: "Каталог", exact: true })).toBeVisible()
  await expect(cards).toHaveCount(4)
  await expect(page.getByRole("button", { name: "Создать своё" })).toBeDisabled()

  await tiers.getByRole("button", { name: "Сообщество" }).click()
  await expect(page.getByRole("status")).toHaveText("Ничего не нашлось")
  await tiers.getByRole("button", { name: "Loginom", exact: true }).click()
  await expect(cards).toHaveCount(4)
  await types.getByRole("button", { name: "Действия" }).click()
  await expect(page.getByText("Действие выполняет шаги с пакетом", { exact: false })).toBeVisible()
  await expect(cards).toHaveCount(0)
  await types.getByRole("button", { name: "Навыки" }).click()
  await search.fill("Word")
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText("Документировать пакет")

  await page.getByRole("button", { name: "Установленные" }).click()
  await expect(search).toBeEmpty()
  await expect(tiers.getByRole("button", { name: "Все", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(types.getByRole("button", { name: "Все", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(cards).toHaveCount(4)
})

test("a shipped skill opens a detail dialog before starting a conversation", async ({ page }) => {
  await mockWorkspace(page, {
    name: "Catalog",
    seed: { locale: "ru" },
    provider: mockModel,
  })
  await page.goto("/page/loginom-gui/catalog")
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Документировать пакет" }) })
  await card.getByRole("button", { name: "Начать разговор" }).click()
  const detail = page.getByRole("dialog", { name: "Документировать пакет" })
  await expect(detail.getByRole("heading", { name: "Что будет разрешено" })).toBeVisible()
  await expect(detail.getByRole("heading", { name: "Совместимость" })).toBeVisible()
  await expect(detail.getByRole("checkbox")).toHaveCount(0)
  await detail.getByRole("button", { name: "Закрыть", exact: true }).last().click()
  await expect(detail).toBeHidden()

  await card.getByRole("button", { name: "Начать разговор" }).click()
  await detail.getByRole("button", { name: "Начать разговор" }).click()
  await expect(page.locator('[data-component="composer-editor"]')).toContainText("Используй навык package-docs.")
})
