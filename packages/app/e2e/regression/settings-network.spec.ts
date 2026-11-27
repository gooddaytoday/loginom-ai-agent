import { expect, test, type Page } from "@playwright/test"
import { Schema } from "effect"
import { Mode, Port, type Status } from "../../../loginom-host/src/network-settings-rpc"
import { NO_PROVIDER, project, SERVER } from "../utils/app"
import { mockOpenCodeServer } from "../utils/mock-server"

const ModeRequest = Schema.Struct({ input: Schema.Struct({ mode: Mode }) })

const PortRequest = Schema.Struct({ input: Schema.Struct({ port: Port }) })

async function settings(page: Page, proxy: "explicit" | "system" | "direct") {
  const port = { current: 28288, saved: 28288, editable: true }
  let mode: Mode = "online"
  await mockOpenCodeServer(page, {
    directory: "/repo",
    project: project({ id: "proj_network", directory: "/repo", name: "Локальный проект" }),
    provider: NO_PROVIDER,
    sessions: [],
    pageMessages: () => ({ items: [] }),
  })
  await page.route("**/api/rpc/loginom.network/*", (route) => {
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type,authorization",
    }

    const request = route.request()

    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers })
    const method = new URL(request.url()).pathname.split("/").at(-1)
    const status = (): Status => ({ mode, activeMode: "online", port })

    if (method === "status") return route.fulfill({ headers, json: { output: status() } })
    const payload: unknown = request.postDataJSON()

    if (method === "setMode" && Schema.is(ModeRequest)(payload)) {
      mode = payload.input.mode

      return route.fulfill({ headers, json: { output: status() } })
    }

    if (method === "savePort" && Schema.is(PortRequest)(payload)) {
      if (payload.input.port === 28289) return route.fulfill({ headers, json: { output: "occupied" } })
      port.saved = payload.input.port

      return route.fulfill({ headers, json: { output: "saved" } })
    }

    return route.abort()
  })
  await page.goto(`/e2e/utils/settings-network.html?${new URLSearchParams({ server: SERVER, proxy })}`)

  return page.getByTestId("settings-screen")
}

test("switches network mode and saves only an available port", async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 1040 })
  const screen = await settings(page, "explicit")
  await expect(screen.getByText("Приложение", { exact: true })).toBeVisible()
  await screen.getByRole("tab", { name: "Сеть", exact: true }).press("Enter")
  await expect(screen.getByRole("radio", { name: /^Интернет/ })).toBeChecked()
  const device = screen.getByRole("radio", { name: /^Только этот компьютер/ })
  await screen.getByText("Только этот компьютер", { exact: true }).click()
  await expect(device).toBeChecked()
  await expect(screen.getByText("Режим сохранён.", { exact: false })).toBeVisible()
  await expect(screen.getByText("В настройках можно подключить только Loginom на этом компьютере.")).toBeVisible()

  const port = screen.getByRole("textbox", { name: "Новый порт" })
  const save = screen.getByRole("button", { name: "Сохранить", exact: true })
  await port.fill("28289")
  await save.click()
  await expect(screen.getByRole("alert")).toHaveText("Этот порт уже занят. Выберите другой порт.")
  await expect(screen.getByText("Текущий порт — 28288")).toBeVisible()
  await port.fill("28291")
  await save.click()
  await expect(screen.getByText("Порт 28291 сохранён.", { exact: false })).toBeVisible()
  await expect(screen.getByText("Текущий порт — 28288")).toBeVisible()

  await screen.getByRole("tab", { name: "Предпочтения", exact: true }).press("Enter")
  await screen.getByRole("tab", { name: "Сеть", exact: true }).press("Enter")
  await expect(device).toBeChecked()
  await expect(port).toHaveValue("28291")
  await expect(screen.getByText("Задан явно · переменные окружения")).toBeVisible()
  await expect(screen.getByText("proxy.example:8080")).toBeVisible()
  await expect(screen.getByText(/sample-user|sample-pass|@proxy\.example/)).toHaveCount(0)
  await page.screenshot({ path: info.outputPath("network-1280.png"), animations: "disabled" })
})

test("fits a 390 px window and shows the system proxy source", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 1320 })
  const screen = await settings(page, "system")
  await screen.getByRole("button", { name: "Предпочтения", exact: true }).click()
  await page.getByRole("menuitemradio", { name: "Сеть", exact: true }).click()
  await expect(screen.getByText("Системный · настройки Windows")).toBeVisible()
  await expect(screen.getByText("Текущий порт — 28288")).toBeVisible()
  const panel = screen.getByRole("tabpanel")
  await expect
    .poll(() =>
      panel.evaluate((element) =>
        Math.max(element.scrollWidth - element.clientWidth, document.documentElement.scrollWidth - window.innerWidth),
      ),
    )
    .toBe(0)
  await expect(screen.getByRole("textbox", { name: "Новый порт" })).toBeInViewport()
  await page.screenshot({ path: info.outputPath("network-390.png"), animations: "disabled" })
})

test("shows when the service connects directly", async ({ page }) => {
  const screen = await settings(page, "direct")
  await screen.getByRole("tab", { name: "Сеть", exact: true }).press("Enter")
  await expect(screen.getByText("Без прокси · прямое подключение")).toBeVisible()
})
