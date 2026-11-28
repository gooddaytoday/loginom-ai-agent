import { expect, test } from "@playwright/test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { sessionHref } from "../utils/app"
import { gateEditor, gateScreenshot, sendGatePrompt, withGate } from "../utils/gate"
import {
  gateLoginom,
  gateMessageContents,
  gateModelID,
  gateScenarios,
  gateToolReceipts,
  salesPackage,
  wizardDocumentation,
} from "../utils/gate-scenarios"
import { APP_READY_TIMEOUT } from "../utils/waits"

test("Сценарий 1. Первый запуск", async ({ page, baseURL }, info) => {
  await withGate(page, baseURL, "first", async ({ url, loginomURL, requests }) => {
    await test.step("В новом разговоре модель уже выбрана", async () => {
      await expect(gateEditor(page)).toBeEditable({ timeout: APP_READY_TIMEOUT })
      await expect(page.locator('[data-action="composer-model"]:visible')).toContainText("Тестовая модель")
      await gateScreenshot(page, info, "1-new-conversation")
    })
    await test.step("Стартовый экран показывает примеры задач", async () => {
      const examples = page.getByRole("region", { name: "Примеры задач" })
      await expect(examples.getByRole("button", { name: /Задокументировать пакет/ })).toBeVisible()
    })
    await test.step("Подключить Loginom в настройках и увидеть адрес и статус", async () => {
      await page.goto(new URL("/settings?tab=loginom", url).href)
      const settings = page.getByRole("tabpanel", { name: "Loginom", exact: true })
      const address = settings.getByRole("textbox", { name: "Адрес", exact: true })
      await expect(settings.getByRole("status")).toHaveText("Не подключён")
      await address.fill(loginomURL)
      await settings.getByRole("textbox", { name: "Пользователь", exact: true }).fill(gateLoginom.username)
      await settings.getByRole("checkbox", { name: "Пароль не нужен", exact: true }).press("Space")
      await settings.getByLabel("Пароль", { exact: true }).fill(gateLoginom.password)
      await settings.getByRole("button", { name: "Проверить", exact: true }).click()
      await expect(settings.getByRole("status")).toContainText("Проверено, ещё не сохранено")
      await settings.getByRole("button", { name: "Сохранить", exact: true }).click()
      const connected = settings
        .getByRole("status")
        .getByText(`Подключён как ${gateLoginom.username} · папка ${gateLoginom.folder}`, { exact: true })
      await expect(connected).toBeVisible()
      await page.reload()
      await expect(address).toHaveValue(loginomURL)
      await expect(connected).toBeVisible()
      await gateScreenshot(page, info, "1-loginom-settings")
      await page.goBack()
    })
    await test.step.skip("LAB-2169 · Подключить учебный Loginom из карточки в чате", async () => {
      await page.getByRole("button", { name: "Подключить публичный стенд" }).click()
    })
    await test.step("Отправить первый вопрос и увидеть ответ", async () => {
      const { prompt, answer } = gateScenarios.first
      await sendGatePrompt(page, prompt)
      await expect(page.getByText(answer, { exact: true })).toBeVisible()
      expect(JSON.stringify(requests)).toContain(prompt)
      await gateScreenshot(page, info, "1-first-answer")
    })
  })
})

test("Сценарий 2. Описать пакет для коллеги", async ({ page, baseURL }, info) => {
  await withGate(page, baseURL, "documentation", async ({ url, directory, requests }) => {
    await test.step("Документировать локальную копию в разговоре и проверить PDF и Word", async () => {
      const { prompt, answer } = gateScenarios.documentation
      const pdf = "Качество данных.lgp_report.pdf"
      const word = "Качество данных.lgp_report.docx"
      await sendGatePrompt(page, prompt)
      const approve = page.getByRole("button", { name: "Разрешить один раз", exact: true })
      const structure = page.getByText(/^\.work\/package-docs\/Качество данных-[a-f0-9]{8}\/structure\.json$/)
      await expect(structure).toBeVisible()
      await gateScreenshot(page, info, "2-documentation-permission")
      await approve.click()
      await expect(structure).toBeHidden()
      await expect(page.getByText(/^\.work\/package-docs\/Качество данных-[a-f0-9]{8}\/report\.md$/)).toBeVisible()
      await approve.click()
      for (const filename of [pdf, word]) {
        await expect(page.getByText(filename, { exact: true })).toBeVisible()
        await approve.click()
      }
      await expect(page.getByText(answer, { exact: true })).toBeVisible({ timeout: 45_000 })
      const pdfPath = path.join(directory, pdf)
      const wordPath = path.join(directory, word)
      await expect
        .poll(() => requests.map(gateToolReceipts))
        .toContainEqual(
          expect.arrayContaining([
            expect.objectContaining({ output: pdfPath }),
            expect.objectContaining({ output: wordPath }),
          ]),
        )
      const [pdfBytes, wordBytes] = await Promise.all([readFile(pdfPath), readFile(wordPath)])
      expect(pdfBytes.subarray(0, 5).toString()).toBe("%PDF-")
      expect(wordBytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
      await info.attach(pdf, { body: pdfBytes, contentType: "application/pdf" })
      await info.attach(word, {
        body: wordBytes,
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      })
      await gateScreenshot(page, info, "2-documentation-in-chat")
    })
    await test.step.skip("LAB-2177 (#1472) / LAB-2178 (#1486) · Выбрать исходный пакет из Loginom", async () => {
      await page.goto(new URL("/page/loginom-gui/packages", url).href)
      await expect(page.getByRole("heading", { name: "Пакеты", exact: true })).toBeVisible()
      await page.getByRole("button", { name: "Из Loginom", exact: true }).click()
      const picker = page.getByRole("dialog")
      const packageName = path.basename(gateLoginom.documentationPath)
      await picker
        .getByRole("button")
        .filter({ has: page.getByText(packageName, { exact: true }) })
        .click()
      await expect(picker).toBeHidden()
      await expect(page.getByRole("heading", { name: packageName, exact: true })).toBeVisible()
      await expect(page.getByText(`/user/${packageName}`, { exact: true })).toBeVisible()
    })
    await test.step.skip("LAB-2179 (#1490) · Запустить мастер и обсудить оба отчёта в разговоре запуска", async () => {
      await page.goto(new URL("/page/loginom-gui/document-package", url).href)
      await page
        .getByLabel("Локальный пакет (.lgp)")
        .fill(path.join(directory, path.basename(gateLoginom.documentationPath)))
      await page.getByRole("checkbox", { name: "Word" }).check()
      await page.getByRole("button", { name: "Далее", exact: true }).click()
      const access = [
        [
          "Сначала приложение",
          "Приложение скопирует выбранный .lgp в папку запуска. Генератор работает только с файлом на компьютере: для пакета из Loginom приложение должно заранее скачать копию, не агент. Пока выберите уже скачанный файл.",
        ],
        [
          "Агент сможет",
          "Прочитать копию, пользоваться встроенной справкой, заполнить черновик и сохранить документы в папке запуска.",
        ],
        [
          "Агент не сможет",
          "Изменять исходный пакет, подключаться к Loginom, открывать браузер и сайты или запускать программы.",
        ],
        [
          "Что увидит модель",
          "Модель увидит имя и структуру пакета, результат генератора, параметры действия и служебный контекст разговора.",
        ],
      ] as const
      for (const [heading, content] of access) {
        const block = page.getByRole("heading", { name: heading, exact: true }).locator("..")
        await expect(block.locator("p")).toHaveText(content)
      }
      const start = page.getByRole("button", { name: "Разрешить и запустить", exact: true })
      await expect(start).toBeDisabled()
      await page.getByRole("combobox", { name: "Модель", exact: true }).selectOption(gateModelID)
      const created = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/session" &&
          response.request().method() === "POST" &&
          response.ok(),
      )
      await start.click()
      const { data: session }: { data: { id: string } } = await (await created).json()
      const outcome = page.getByRole("main").getByRole("status").getByRole("heading", { level: 2 })
      await expect(outcome).toBeVisible({ timeout: 90_000 })
      expect(await outcome.textContent()).toBe("Готово")
      await expect(page.getByRole("heading", { name: "Что проверило приложение", exact: true })).toBeVisible()
      const files = [wizardDocumentation.pdf, wizardDocumentation.word]
      for (const filename of files) await expect(page.getByText(filename, { exact: false })).toBeVisible()
      await page.getByRole("button", { name: "Обсудить в чате", exact: true }).click()
      await expect(page).toHaveURL(new URL(sessionHref(session.id, url), url).href)
      await expect(page.getByText(wizardDocumentation.answer, { exact: true })).toBeVisible()
      const attachments = page.locator('[data-component="composer-attachments"]')
      for (const filename of files) await expect(attachments.getByText(filename, { exact: true })).toBeVisible()
    })
  })
})

test("Сценарий 4. Правила отдела", async ({ page, baseURL }, info) => {
  await withGate(page, baseURL, "instructions", async ({ url, requests, openedPackages }) => {
    const rules =
      "Узлы называй по смыслу, по-русски. Перед расчётом выручки — проверка пустых значений. В каждом модуле — заметка: что делает и кто отвечает."
    const receipt = expect.objectContaining({
      prepared: true,
      workspace: expect.objectContaining({
        operation_id: salesPackage.operationID,
        status: "READY",
        package_ref: expect.objectContaining({ path: salesPackage.path, name: salesPackage.name, persisted: true }),
      }),
    })
    const readingRequest = () =>
      requests.find((request) => gateToolReceipts(request).some((reply) => receipt.asymmetricMatch(reply)))
    await test.step.skip("LAB-2174 (#1454) · Сохранить правила отдела в настройках инструкций", async () => {
      await page.goto(new URL("/settings?tab=instructions", url).href)
      const settings = page.getByRole("tabpanel", { name: "Инструкции", exact: true })
      const text = settings.getByRole("textbox", { name: "Инструкции", exact: true })
      const save = settings.getByRole("button", { name: "Сохранить", exact: true })
      await text.fill(rules)
      await save.click()
      await expect(settings.getByRole("status")).toHaveText("")
      await page.reload()
      await expect(text).toHaveValue(rules)
      await page.goBack()
    })
    await test.step("Дымовая проверка чтения пакета «Продажи» в новом разговоре", async () => {
      const { prompt, answer } = gateScenarios.instructions
      await sendGatePrompt(page, prompt)
      await expect.poll(() => requests.flatMap(gateToolReceipts), { timeout: 90_000 }).toContainEqual(receipt)
      await expect(page.getByText(answer, { exact: true })).toBeVisible()
      expect(openedPackages).toEqual([salesPackage.path])
      await gateScreenshot(page, info, "4-sales-review")
    })
    await test.step.skip("LAB-2174 (#1454) · Модель получила сохранённые правила в новом разговоре", async () => {
      expect(gateMessageContents(readingRequest(), "system").join("\n")).toContain(rules)
    })
    await test.step.skip("UI ещё не выдан · В ленте видна метка «Учёл ваши инструкции»", async () => {
      await expect(page.getByText("Учёл ваши инструкции", { exact: true })).toBeVisible()
    })
  })
})
