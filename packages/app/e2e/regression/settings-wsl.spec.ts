import { expect, test } from "@playwright/test"
import { NO_PROVIDER, REMOTE_SERVER, SERVER, project } from "../utils/app"
import { mockOpenCodeServer } from "../utils/mock-server"

// Loginom AI Agent (B4.11e): the product window loads no pairing, SSH or WSL plugin, as in 0.4; SSH and WSL install
// upstream OpenCode on the remote machine. The fixture's main side still holds a configured WSL server (Ubuntu) and a
// saved SSH server (box), as Desktop main would: the window shows neither and offers no way to add one or pair a device.
// The plugins' own behaviour stays covered by their unit tests in `packages/gui-plugins` and by
// `component-tests/ssh-reconnect.spec.ts`; the upstream spec is in the history (B4.11e, docs/upstream-sync).

test.use({ viewport: { width: 1280, height: 900 } })

test("desktop settings offer no WSL, SSH or pairing", async ({ page }) => {
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
      mode: "ready",
      distros: "Ubuntu-24.04",
      ssh: REMOTE_SERVER,
    })}`,
  )
  const settings = page.getByTestId("settings-screen")
  const server = settings.getByRole("tab", { name: "Server", exact: true })

  // Only this computer's server: no WSL or SSH server joins it, so the page keeps its single-server name.
  await expect(server).toBeVisible()
  await expect(settings.getByRole("tab", { name: "Servers", exact: true })).toHaveCount(0)
  await expect(settings.getByRole("tab", { name: "Pairing", exact: true })).toHaveCount(0)

  await server.click()
  await expect(settings.getByRole("region", { name: "Ubuntu", exact: true })).toHaveCount(0)
  await expect(settings.getByRole("region", { name: "box", exact: true })).toHaveCount(0)

  // Without plugin kinds of server, Add server opens the app's own dialog instead of a menu.
  await settings.getByRole("button", { name: "Add server", exact: true }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await expect(page.getByRole("menuitem")).toHaveCount(0)
})
