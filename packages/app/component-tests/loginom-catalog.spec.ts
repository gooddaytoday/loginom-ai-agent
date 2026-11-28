import { expect, sourceURL, story } from "../../stories/playwright/story"

const fixtures = {
  host: sourceURL(new URL("./plugin-host.fixture.tsx", import.meta.url)),
  plugin: sourceURL(new URL("../../gui-plugins/src/loginom-gui/catalog.fixture.tsx", import.meta.url)),
}

story("a community skill requires fresh consent each time its dialog opens", async ({ mount, page }) => {
  await mount("ui-line-comment--editor")
  await page.evaluate(async (fixtures) => {
    const { mountPlugins } = await import(fixtures.host)
    const { communitySkillPlugin } = await import(fixtures.plugin)
    mountPlugins({ definitions: [communitySkillPlugin] })
  }, fixtures)

  const open = page.getByRole("button", { name: "Open skill details" })
  const dialog = page.getByRole("dialog", { name: "Community skill" })
  const start = dialog.getByRole("button", { name: "Start conversation" })
  const consent = dialog.getByRole("checkbox", { name: /I understand that Loginom did not check this skill/ })
  await open.click()
  await expect(start).toBeDisabled()
  await consent.press("Space")
  await expect(start).toBeEnabled()
  await consent.press("Space")
  await expect(start).toBeDisabled()
  await consent.press("Space")
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(page.getByText("No conversation")).toBeVisible()

  await open.click()
  await expect(consent).not.toBeChecked()
  await expect(start).toBeDisabled()
  await consent.press("Space")
  await start.click()
  await expect(page.getByText("Conversation started")).toBeVisible()
})
