import { expect, test, type Page } from "@playwright/test"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectAppVisible } from "../utils/waits"

const directory = "C:/Loginom AI Agent/PromptInputV2Editing"
const projectID = "proj_prompt_input_v2_editing"
const sessionID = "ses_prompt_input_v2_editing"

async function mockSession(page: Page, newLayoutDesigns: boolean) {
  await mockOpenCodeServer(page, {
    directory,
    project: {
      id: projectID,
      worktree: directory,
      vcs: "git",
      name: "prompt-input-v2-editing",
      time: { created: 1700000000000, updated: 1700000000000 },
      sandboxes: [],
    },
    provider: { all: [], connected: [], default: {} },
    sessions: [
      {
        id: sessionID,
        slug: "prompt-input-v2-editing",
        projectID,
        directory,
        title: "Prompt input V2 editing",
        version: "dev",
        time: { created: 1700000000000, updated: 1700000000000 },
      },
    ],
    pageMessages: () => ({ items: [] }),
  })
  await page.addInitScript((newLayoutDesigns) => {
    localStorage.setItem("app-version.v1", JSON.stringify({ version: "1.19.5" }))
    localStorage.setItem("settings.v3", JSON.stringify({
      general: { newLayoutDesigns, layoutTransitionEligible: true, newInterfaceNoticeDismissed: true },
    }))
  }, newLayoutDesigns)
  // Exercise the legacy composer before the old interface's scheduled retirement.
  if (!newLayoutDesigns) await page.clock.setFixedTime(new Date("2026-08-01T12:00:00Z"))
}

test("preserves the draft when a populated command menu triggers a built-in", async ({ page }) => {
  await mockSession(page, true)
  await page.goto(`/${base64Encode(directory)}/session/${sessionID}`)
  const composer = page.locator('[data-component="prompt-input-v2"]')
  const input = composer.locator('[data-component="prompt-input"]')
  await expectAppVisible(composer)

  await input.fill("keep me")
  await composer.getByRole("button", { name: "Add images and files" }).click()
  await page.getByRole("menuitem", { name: "Commands" }).click()
  await page.locator('[data-suggestion-id="model.choose"]').click()

  await expect(input).toHaveText("keep me")
})

for (const newLayoutDesigns of [false, true]) {
  test(`refreshes installed skills when the ${newLayoutDesigns ? "new" : "legacy"} command list opens`, async ({ page }) => {
    await mockSession(page, newLayoutDesigns)
    let installed = "check-old-columns"
    await page.route((url) => url.pathname === "/command", (route) =>
      route.fulfill({
        json: [{ name: installed, template: "Check columns.", description: "Checks required columns.", source: "skill" }],
        headers: { "access-control-allow-origin": "*" },
      }),
    )
    await page.goto(`/${base64Encode(directory)}/session/${sessionID}`)
    const input = page.locator('[data-component="prompt-input"][contenteditable="true"]')
    await expectAppVisible(input)
    await expect(page.locator('[data-component="prompt-input-v2"]')).toHaveCount(newLayoutDesigns ? 1 : 0)

    await input.fill("/check-")
    await expect(page.getByText("/check-old-columns", { exact: true })).toBeVisible()
    await input.fill("")
    await expect(page.getByText("/check-old-columns", { exact: true })).toBeHidden()

    installed = "check-new-columns"
    await input.fill("/check-")
    await expect(page.getByText("/check-new-columns", { exact: true })).toBeVisible()
    await expect(page.getByText("/check-old-columns", { exact: true })).toBeHidden()

    if (newLayoutDesigns) {
      await input.fill("")
      await expect(page.getByText("/check-new-columns", { exact: true })).toBeHidden()
      installed = "check-menu-columns"
      await page.getByRole("button", { name: "Add images and files" }).click()
      await page.getByRole("menuitem", { name: "Commands" }).click()
      await expect(page.getByText("/check-menu-columns", { exact: true })).toBeVisible()
      await expect(page.getByText("/check-new-columns", { exact: true })).toBeHidden()
    }
    await page.getByText("/" + installed, { exact: true }).click()
    await expect(input).toHaveText("/" + installed)
  })
}
