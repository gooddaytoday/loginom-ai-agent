import { expect, test } from "@playwright/test"
import { SERVER, project } from "../utils/app"
import { mockWorkspace, newSessionLocation } from "../utils/workspace"

const mockModel = {
  all: [{ id: "test", name: "Test", models: { catalog: { id: "catalog", name: "Catalog test" } } }],
  connected: ["test"],
  default: { providerID: "test", modelID: "catalog" },
}

test("the catalog filters bundled actions and skills and resets filters when switching sections", async ({ page }) => {
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
  await expect(cards.getByRole("heading")).toHaveText(["Документировать", "Проверить"])
  await expect(cards.getByRole("button", { name: "Запустить" })).toHaveCount(2)
  await search.fill("Word")
  await expect(cards.getByRole("heading")).toHaveText(["Документировать"])
  await search.clear()
  await types.getByRole("button", { name: "Навыки" }).click()
  await expect(cards.getByRole("heading")).toHaveText(["Построить сценарий Loginom", "Создать дашборд"])
  await expect(cards.getByRole("button", { name: "Начать разговор" })).toHaveCount(2)
  await search.fill("дашборд")

  await page.getByRole("button", { name: "Установленные" }).click()
  await expect(search).toBeEmpty()
  await expect(tiers.getByRole("button", { name: "Все", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(types.getByRole("button", { name: "Все", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(cards).toHaveCount(4)
})

test("an action opens its details and drafts the request in the selected project", async ({ page }) => {
  const directory = "C:/OpenCode/Catalog"

  await mockWorkspace(page, {
    name: "Catalog",
    directory,
    projects: [
      project({ id: "proj_other_chat", directory: "C:/OpenCode/.conversations/other", name: "Other chat" }),
      project({ id: "proj_catalog", directory, name: "Catalog" }),
    ],
    seed: {
      locale: "ru",
      storage: { "opencode.global.dat:layout": { home: { selection: { server: SERVER, directory } } } },
    },
    provider: mockModel,
  })
  await page.goto("/page/loginom-gui/catalog")
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Документировать" }) })
  await card.getByRole("button", { name: "Запустить" }).click()
  const detail = page.getByRole("dialog", { name: "Документировать" })
  await expect(detail.getByRole("heading", { name: "Что будет разрешено" })).toBeVisible()
  await expect(detail.getByRole("heading", { name: "Совместимость" })).toBeVisible()
  await expect(detail.getByRole("checkbox")).toHaveCount(0)
  await detail.getByRole("button", { name: "Закрыть", exact: true }).last().click()
  await expect(detail).toBeHidden()

  await card.getByRole("button", { name: "Запустить" }).click()
  await detail.getByRole("button", { name: "Запустить" }).click()
  await expect(page.locator('[data-component="composer-editor"]')).toHaveText("Документируй пакет Loginom.")
  await expect(newSessionLocation(page)).toContainText("Catalog")
})

test("a fresh profile can choose a folder and gets the catalog draft prompt", async ({ page }) => {
  await mockWorkspace(page, {
    name: "FirstProject",
    projects: [],
    sessions: [],
    seed: { locale: "ru", usedProjects: { local: [] } },
    provider: mockModel,
    fileList: () => [],
  })
  await page.goto("/page/loginom-gui/catalog")
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Создать дашборд" }) })
  await card.getByRole("button", { name: "Начать разговор" }).click()
  await page.getByRole("dialog", { name: "Создать дашборд" }).getByRole("button", { name: "Начать разговор" }).click()

  const picker = page.getByRole("dialog", { name: "Открыть проект", exact: true })
  await expect(picker).toBeVisible()
  await picker.getByRole("button", { name: "Выбрать папку", exact: true }).click()
  await expect(picker).toBeHidden()
  await expect(page.locator('[data-component="composer-editor"]')).toHaveText("Помоги создать дашборд Loginom.")
})
