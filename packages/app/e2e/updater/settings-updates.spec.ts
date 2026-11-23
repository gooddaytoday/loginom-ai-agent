import { expect, test } from "@playwright/test"
import { writeFile } from "node:fs/promises"

for (const locale of ["en", "ru"]) {
  test(`titlebar ${locale}: update tooltip exposes the available version`, async ({ page }) => {
    await page.goto(`/e2e/updater/index.html?part=titlebar&locale=${locale}`)
    const action = page.getByRole("button", { name: locale === "ru" ? "Скачать" : "Download", exact: true })
    await expect(action).toBeEnabled()
    await expect(action).toHaveAttribute("title", locale === "ru" ? "Обновить 0.4.902" : "Update 0.4.902")
    await action.click()
    await expect(page.locator('[data-tid="update-test-result"]')).toHaveText(
      JSON.stringify({ opened: ["https://updates.example.test/0.4.902/download"], installs: 0, checks: 0 }),
    )
  })
}

for (const layout of ["legacy", "v2"]) {
  for (const os of ["linux", "macos"]) {
    for (const locale of ["en", "ru"]) {
      test(`${layout} ${os} ${locale}: notification version, safe bounded notes and download`, async ({
        page,
      }, testInfo) => {
        await page.goto(`/e2e/updater/index.html?layout=${layout}&os=${os}&locale=${locale}`)
        const download = page.getByRole("button", { name: locale === "ru" ? "Скачать" : "Download", exact: true })
        await expect(download).toBeEnabled()
        await testInfo.attach("available DOM", { body: await page.content(), contentType: "text/html" })
        await page.screenshot({ path: testInfo.outputPath("available.png") })
        if (process.env.UPDATE_DOM_DIR) {
          await writeFile(`${process.env.UPDATE_DOM_DIR}/${layout}-${os}-${locale}.html`, await page.content())
          await page.screenshot({ path: `${process.env.UPDATE_DOM_DIR}/${layout}-${os}-${locale}.png` })
        }
        const notice = page.locator('[data-tid="update-available"]')
        await expect(notice).toContainText(locale === "ru" ? "Доступна версия 0.4.902" : "Version 0.4.902 is available")
        const notes = notice.locator('[data-tid="update-notes"]')
        await expect(notes).toHaveText('<img src=x onerror="alert(1)">\n' + "Release notes\n".repeat(100))
        await expect(notes.locator("img")).toHaveCount(0)
        expect(
          await notes.evaluate(
            (element) =>
              element.scrollHeight > element.clientHeight &&
              getComputedStyle(element).overflowY === "auto" &&
              element.clientHeight <= 128,
          ),
        ).toBe(true)
        await download.click()
        await expect(page.locator('[data-tid="update-test-result"]')).toHaveText(
          JSON.stringify({ opened: ["https://updates.example.test/0.4.902/download"], installs: 0, checks: 0 }),
        )
        await page.locator('[data-tid="update-test-no-notes"]').click()
        await expect(notice).toContainText("0.4.903")
        await expect(notes).toHaveCount(0)
      })
    }
  }

  for (const os of ["linux", "windows"]) {
    test(`${layout} ${os}: automatic update actions stay unchanged`, async ({ page }) => {
      await page.goto(`/e2e/updater/index.html?layout=${layout}&os=${os}`)
      await expect(page.getByRole("button", { name: "Download", exact: true })).toBeEnabled()
      await page.locator('[data-tid="update-test-downloading"]').click()
      await expect(page.getByRole("button", { name: "Downloading...", exact: true })).toBeDisabled()
      await expect(page.locator('[data-tid="update-available"]')).toHaveCount(0)
      await page.locator('[data-tid="update-test-ready"]').click()
      await expect(page.locator('[data-tid="update-on-close"]')).toBeVisible()
      await page.getByRole("button", { name: "Close and update", exact: true }).click()
      await expect(page.locator('[data-tid="update-test-result"]')).toHaveText(
        JSON.stringify({ opened: [], installs: 1, checks: 0 }),
      )
    })
  }
}
