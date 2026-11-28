import { expect, test, type Page } from "@playwright/test"
import { filename, mockDocumentPackage, output, sessionID } from "../utils/document-package"

async function open(page: Page, mode: Parameters<typeof mockDocumentPackage>[1]) {
  const fixture = await mockDocumentPackage(page, mode)
  await page.goto("/page/loginom-gui/document-package")
  await expect(page.getByRole("heading", { name: "Документировать пакет" })).toBeVisible()

  return fixture
}

test("the wizard leaves execution when the server silently stops responding", async ({ page }) => {
  await page.addInitScript(() => {
    const native = AbortSignal.timeout
    AbortSignal.timeout = (milliseconds) => native(milliseconds === 300_000 ? 1_000 : milliseconds)
  })
  await open(page, "timeout")
  await access(page)
  await page.getByRole("button", { name: "Разрешить и запустить" }).click()
  await expect(page.getByRole("heading", { name: "Нужно проверить состояние" })).toBeVisible()
  await page.getByRole("button", { name: "Проверить состояние", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Готово", exact: true })).toBeVisible()
})

test("stopping before admission removes the unused session and package copy", async ({ page }) => {
  const fixture = await open(page, "cancel-before-start")
  await access(page)
  await page.getByRole("button", { name: "Разрешить и запустить" }).click()
  await fixture.creating
  await page.getByRole("button", { name: "Остановить", exact: true }).click()
  fixture.release()
  await expect(page.getByRole("heading", { name: "Запуск остановлен" })).toBeVisible()
  await fixture.removed
  expect(await fixture.copyFinished).toMatchObject({ input: { keep: false } })
  await expect(page.getByRole("button", { name: "Открыть полный разговор" })).toHaveCount(0)
})

async function access(page: Page) {
  await expect(page.getByRole("button", { name: "Далее" })).toBeDisabled()
  await page.getByLabel("Локальный пакет (.lgp)").fill(`/fixture/${filename}`)
  await page.getByRole("button", { name: "Далее" }).click()
  await expect(page.getByRole("heading", { name: "Сначала приложение" })).toBeVisible()
  await page.getByRole("combobox", { name: "Модель" }).selectOption("test/test-model")
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`documents a package for a colleague at width ${viewport.width}`, async ({ page }, info) => {
    await page.setViewportSize(viewport)
    const fixture = await open(page, "ready")
    await page.getByRole("checkbox", { name: "PDF" }).uncheck()
    await page.getByLabel("Локальный пакет (.lgp)").fill(`/fixture/${filename}`)
    await expect(page.getByRole("button", { name: "Далее" })).toBeDisabled()
    await page.getByRole("checkbox", { name: "PDF" }).check()
    await page.getByRole("radio", { name: "Своё" }).check()
    await expect(page.getByRole("button", { name: "Далее" })).toBeDisabled()
    await page.getByLabel("Какая документация нужна").fill("Укажите, какие данные нужны на входе.")
    await page.getByRole("button", { name: "Далее" }).click()
    await expect(page.getByText(/ваше описание/)).toBeVisible()
    await expect(page.getByRole("heading", { name: "Агент сможет", exact: true })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Агент не сможет", exact: true })).toBeVisible()
    await page.getByRole("combobox", { name: "Модель" }).selectOption("test/test-model")
    const start = page.getByRole("button", { name: "Разрешить и запустить" })
    await expect(start).toBeInViewport()
    await page.getByRole("heading", { name: "Что увидит модель" }).scrollIntoViewIfNeeded()
    await expect(start).toBeInViewport()
    await page.screenshot({ path: info.outputPath(`access-${viewport.width}.png`) })
    await start.click()
    expect(await fixture.admitted).toMatchObject({
      input: {
        sessionID,
        profile: "package-docs",
        documentationFile: filename,
        customDocumentation: true,
        text: expect.stringContaining("Укажите, какие данные нужны на входе."),
      },
    })
    await expect(page.getByRole("heading", { name: "Готово" })).toBeVisible()
    await expect(page.getByText(output, { exact: false })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Что проверило приложение" })).toBeVisible()
    await page.screenshot({ path: info.outputPath(`result-${viewport.width}.png`) })
  })
}

for (const [mode, label] of [
  ["unconfirmed", "Результат не подтверждён"],
  ["failed", "Не удалось"],
  ["unknown", "Нужно проверить состояние"],
  ["stopped", "Запуск остановлен"],
] as const) {
  test(label, async ({ page }) => {
    const fixture = await open(page, mode)

    if (mode === "unconfirmed") {
      await page.getByRole("checkbox", { name: "Word" }).check()
      await page.getByRole("checkbox", { name: "Markdown" }).check()
    }

    await access(page)
    await page.getByRole("button", { name: "Разрешить и запустить" }).click()

    if (mode === "stopped") {
      await fixture.admitted
      await page.getByRole("button", { name: "Остановить", exact: true }).click()
      expect(await fixture.stopped).toBe("false")
    }

    await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible()

    if (mode === "unknown") {
      await expect(page.getByRole("button", { name: "Запустить ещё раз" })).toHaveCount(0)
      await page.getByRole("button", { name: "Проверить состояние", exact: true }).click()
      await expect(page.getByRole("heading", { name: "Готово", exact: true })).toBeVisible()
    } else if (mode === "unconfirmed") {
      expect(await fixture.admitted).toMatchObject({ input: { text: expect.stringContaining("pdf, docx, md") } })
      await expect(page.getByText(output, { exact: false })).toBeVisible()
      await expect(page.getByText(/описание\.docx|описание\.md/)).toHaveCount(0)
    } else {
      await expect(page.getByText("Нет подтверждённых файлов.")).toBeVisible()
    }
  })
}
