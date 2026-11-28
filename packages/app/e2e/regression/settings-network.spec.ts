import { expect, test, type Page } from "@playwright/test"
import { Schema } from "effect"
import { Port, type Status } from "../../../loginom-host/src/network-settings-rpc"
import { serviceProxyStatus } from "../../../loginom-host/src/system-proxy/service-status"
import { NO_PROVIDER, project, SERVER } from "../utils/app"
import { mockOpenCodeServer } from "../utils/mock-server"

const PortRequest = Schema.Struct({ input: Schema.Struct({ port: Port }) })

const environments = {
  explicit: { HTTPS_PROXY: "http://sample-user:sample-pass@proxy.example:8080" },
  system: { HTTPS_PROXY: "http://proxy.example:8080", LOGINOM_AI_AGENT_RUNTIME_PROXY_SOURCE: "windows" },
  direct: {},
}

async function settings(
  page: Page,
  proxy: keyof typeof environments,
  fallback = false,
  web = false,
  stallSave?: Promise<void>,
) {
  let port: NonNullable<Status["port"]> = {
    current: 28288,
    saved: fallback ? 28289 : 28288,
    maximum: 32767,
    editable: true,
  }

  if (fallback) port = { ...port, fallback: port.saved }

  await mockOpenCodeServer(page, {
    directory: "/repo",
    project: project({ id: "proj_network", directory: "/repo", name: "Локальный проект" }),
    provider: NO_PROVIDER,
    sessions: [],
    pageMessages: () => ({ items: [] }),
  })
  await page.route("**/api/rpc/loginom.network/*", async (route) => {
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type,authorization",
    }

    const request = route.request()

    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers })
    const url = new URL(request.url())

    if (url.searchParams.get("location[directory]") !== "/repo") return route.abort()

    const method = url.pathname.split("/").at(-1)
    const payload: unknown = request.postDataJSON()

    if (method === "status") {
      const output: Status = { proxy: serviceProxyStatus(environments[proxy]), port }

      return route.fulfill({ headers, json: { output } })
    }

    if (method === "savePort" && Schema.is(PortRequest)(payload)) {
      if (stallSave) {
        await stallSave

        return route.abort()
      }

      if (payload.input.port === 28289) return route.fulfill({ headers, json: { output: "occupied" } })
      port = { ...port, saved: payload.input.port }

      return route.fulfill({ headers, json: { output: "saved" } })
    }

    return route.abort()
  })
  await page.goto(
    `/e2e/utils/settings-network.html?${new URLSearchParams({ server: SERVER, platform: web ? "web" : "desktop" })}`,
  )

  return page.getByTestId("settings-screen")
}

test("shows sanitized proxy details and saves only an available port", async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 1040 })
  const screen = await settings(page, "explicit")
  await screen.getByRole("tab", { name: "Сеть", exact: true }).press("Enter")
  const panel = screen.getByRole("tabpanel")
  await expect(panel.getByRole("radio")).toHaveCount(0)
  await expect(panel.getByText(/^(Обновления|Каталог)$/)).toHaveCount(0)
  await expect(panel.getByText("Задан явно · переменные окружения")).toBeVisible()
  await expect(panel.getByText("proxy.example:8080", { exact: true })).toBeVisible()
  await expect(panel.getByText(/sample-user|sample-pass|@proxy\.example/)).toHaveCount(0)

  const port = panel.getByRole("textbox", { name: "Новый порт" })
  const save = panel.getByRole("button", { name: "Сохранить", exact: true })
  await port.fill("32768")
  await save.click()
  await expect(panel.getByRole("alert")).toHaveText("Введите целое число от 1 до 32767.")
  await port.fill("28289")
  await save.click()
  await expect(panel.getByRole("alert")).toHaveText("Этот порт уже занят. Выберите другой порт.")
  await expect(panel.getByText("Текущий порт — 28288")).toBeVisible()
  await port.fill("28291")
  await save.click()
  await expect(panel.getByText("Порт 28291 сохранён. Он вступит в силу после перезапуска приложения.")).toBeVisible()
  await expect(panel.getByText("Текущий порт — 28288")).toBeVisible()

  await screen.getByRole("tab", { name: /^(Предпочтения|Общие)$/ }).press("Enter")
  await screen.getByRole("tab", { name: "Сеть", exact: true }).press("Enter")
  await expect(port).toHaveValue("28291")
  await page.screenshot({ path: info.outputPath("network-1280.png"), animations: "disabled" })
})

test("fits a 390 px window and shows the default port fallback", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 1000 })
  const screen = await settings(page, "system", true)
  await screen.getByRole("button", { name: /^(Предпочтения|Общие)$/ }).click()
  await page.getByRole("menuitemradio", { name: "Сеть", exact: true }).click()
  await expect(screen.getByText("Системный · настройки Windows")).toBeVisible()
  await expect(screen.getByText("Текущий порт — 28288")).toBeVisible()
  await expect(
    screen.getByText("Сохранённый порт 28289 недоступен. Служба использует порт по умолчанию 28288."),
  ).toBeVisible()
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

test("shows when the service connects directly in the web app", async ({ page }) => {
  const screen = await settings(page, "direct", false, true)
  await screen.getByRole("tab", { name: "Сеть", exact: true }).press("Enter")
  await expect(screen.getByText("Без прокси · прямое подключение")).toBeVisible()
})

test("releases the form after the save request times out", async ({ page }) => {
  const stall = Promise.withResolvers<void>()

  try {
    const screen = await settings(page, "direct", false, false, stall.promise)
    await screen.getByRole("tab", { name: "Сеть", exact: true }).press("Enter")
    const port = screen.getByRole("textbox", { name: "Новый порт" })
    const save = screen.getByRole("button", { name: "Сохранить", exact: true })
    await port.fill("28290")
    await save.click()
    await expect(save).toBeDisabled()
    await expect(screen.getByRole("alert")).toHaveText("Не удалось использовать или сохранить этот порт.", {
      timeout: 18_000,
    })
    await expect(port).toHaveValue("28290")
    await expect(save).toBeEnabled()
  } finally {
    stall.resolve()
  }
})
