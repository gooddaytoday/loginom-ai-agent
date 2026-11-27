import { expect, test } from "@playwright/test"
import { NO_PROVIDER, REMOTE_SERVER, SERVER, project } from "../utils/app"
import { mockOpenCodeServer } from "../utils/mock-server"

test.use({ viewport: { width: 1280, height: 900 } })

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
  const server = settings.getByRole("tab", { name: "Серверы", exact: true })

  await expect(server).toBeVisible()
  await expect(settings.getByRole("tab", { name: "Сопряжение", exact: true })).toHaveCount(0)

  await server.click()
  await expect(settings.getByRole("region", { name: "Ubuntu", exact: true })).toBeVisible()
  await expect(settings.getByRole("region", { name: "box", exact: true })).toHaveCount(0)
  await expect(page.getByLabel("WSL actions")).toHaveText("")

  await settings.getByRole("button", { name: "Добавить сервер", exact: true }).click()
  await expect(page.getByRole("menuitem", { name: "Добавить сервер WSL" })).toBeVisible()
  await expect(page.getByRole("menuitem", { name: /SSH/ })).toHaveCount(0)

  await page.keyboard.press("Escape")
  await settings
    .getByRole("region", { name: "Ubuntu", exact: true })
    .getByRole("button", { name: "Дополнительные опции" })
    .click()
  await page.getByRole("menuitem", { name: "Запустить сервер" }).click()
  await expect(page.getByLabel("WSL actions")).toHaveText("start:wsl:Ubuntu")
})
