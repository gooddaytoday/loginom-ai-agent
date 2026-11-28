import { expect, test } from "@playwright/test"
import { NO_PROVIDER, REMOTE_SERVER, SERVER, project } from "../utils/app"
import { mockOpenCodeServer } from "../utils/mock-server"

// Use the fixture's Russian locale without the English preference seeded by the shared E2E config.
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1280, height: 900 } })

test("desktop settings offer WSL while SSH and pairing stay hidden", async ({ page }) => {
  await mockOpenCodeServer(page, {
    directory: "/repo",
    project: project({ id: "proj_no_remote", directory: "/repo", name: "Local project" }),
    provider: NO_PROVIDER,
    sessions: [],
    pageMessages: () => ({ items: [] }),
  })
  await page.goto(
    `/e2e/utils/settings-wsl.html?${new URLSearchParams({
      server: SERVER,
      mode: "stopped",
      locale: "ru",
      distros: "Ubuntu-24.04",
      ssh: REMOTE_SERVER,
    })}`,
  )
  const settings = page.getByTestId("settings-screen")
  const server = settings.getByRole("tab", { name: /^Серверы?$/ })

  await expect(server).toBeVisible()
  await expect(settings.getByRole("tab", { name: "Общие", exact: true })).toBeVisible()
  await expect(settings.getByRole("tab", { name: "Сопряжение", exact: true })).toHaveCount(0)

  await server.click()
  await expect(settings.getByRole("region", { name: "Ubuntu", exact: true })).toBeVisible()
  await expect(settings.getByRole("region", { name: "box", exact: true })).toHaveCount(0)
  await expect(page.getByLabel("WSL actions")).toHaveText("")

  await settings.getByRole("button", { name: "Добавить сервер", exact: true }).click()
  await expect(page.getByRole("menuitem", { name: "Добавить сервер WSL" })).toBeVisible()
  await expect(page.getByRole("menuitem", { name: /SSH/ })).toHaveCount(0)

  await settings.getByRole("button", { name: "Добавить сервер", exact: true }).click()
  await settings
    .getByRole("region", { name: "Ubuntu", exact: true })
    .getByRole("button", { name: "Дополнительные опции" })
    .click()
  await page.getByRole("menuitem", { name: "Запустить сервер" }).click()
  await expect(page.getByLabel("WSL actions")).toHaveText("start:wsl:Ubuntu")
})

test("a narrow WSL row offers a runnable Loginom setup command after installing the CLI", async ({ page, context }) => {
  await page.setViewportSize({ width: 500, height: 900 })
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await mockOpenCodeServer(page, {
    directory: "/repo",
    project: project({ id: "proj_no_remote", directory: "/repo", name: "Local project" }),
    provider: NO_PROVIDER,
    sessions: [],
    pageMessages: () => ({ items: [] }),
  })
  await page.goto(
    `/e2e/utils/settings-wsl.html?${new URLSearchParams({ server: SERVER, mode: "stopped", locale: "ru", cli: "missing" })}`,
  )
  const settings = page.getByTestId("settings-screen")
  await settings.getByRole("button", { name: "Общие", exact: true }).click()
  await page.getByRole("menuitemradio", { name: /^Серверы?$/ }).click()
  const ubuntu = settings.getByRole("region", { name: "Ubuntu", exact: true })
  const hint = ubuntu.getByText("Чтобы инструменты Loginom работали в WSL, выполните loginom setup в дистрибутиве")
  await expect(hint).toHaveCount(0)
  await ubuntu.getByRole("button", { name: "Установить Loginom AI Agent CLI" }).click()
  await expect(hint).toBeVisible()
  await ubuntu.getByRole("button", { name: "Скопировать команду" }).click()
  await expect(page.getByText("Команда скопирована", { exact: true })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    '"$HOME/.local/share/loginom-ai-agent-wsl/current/bin/loginom-ai-agent-cli" loginom setup',
  )
})
