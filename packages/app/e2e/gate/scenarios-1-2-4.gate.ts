import { expect, test } from "@playwright/test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { draftHref } from "../utils/app"
import { gateEditor, gateScreenshot, sendGatePrompt, withGate } from "../utils/gate"
import { gateLoginom, gateMessageContents, gateScenarios, gateToolReceipts } from "../utils/gate-scenarios"
import { APP_READY_TIMEOUT } from "../utils/waits"

test("Сценарий 1. Первый запуск", async ({ page, baseURL }, info) => {
  await withGate(page, baseURL, "first", async ({ url, requests, calls }) => {
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
      await address.fill(gateLoginom.url)
      await settings.getByRole("textbox", { name: "Пользователь", exact: true }).fill(gateLoginom.username)
      await settings.getByRole("checkbox", { name: "Пароль не нужен", exact: true }).check()
      await settings.getByRole("button", { name: "Проверить", exact: true }).click()
      await expect(settings.getByRole("status")).toContainText("Проверено, ещё не сохранено")
      await settings.getByRole("button", { name: "Сохранить", exact: true }).click()
      await expect(settings.getByRole("status")).toHaveText(
        `Подключён как ${gateLoginom.username} · папка ${gateLoginom.folder}`,
      )
      await expect(address).toHaveValue(gateLoginom.url)
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
      expect(calls).toEqual([])
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
    await test.step.skip("LAB-2177 / LAB-2178 · Выбрать пакет «Качество данных» из Loginom", async () => {
      await page.goto(new URL(draftHref("gate-documentation-wizard"), url).href)
      await page.getByRole("button", { name: "Документировать", exact: true }).click()
      await page.getByText(/^Качество данных(?:\.lgp)?$/).click()
    })
    const wizardPDF = "Качество данных — описание.pdf"
    const wizardWord = "Качество данных — описание.docx"
    await test.step.skip("LAB-2179 · Добавить Word, прочитать «Доступ» и разрешить запуск мастера", async () => {
      await page.getByRole("checkbox", { name: "Word" }).check()
      await page.getByRole("button", { name: "Далее: доступ" }).click()
      await expect(page.getByText("Сначала приложение", { exact: true })).toBeVisible()
      await expect(page.getByText(/Скачает «Качество данных\.lgp» из вашей папки Loginom/)).toBeVisible()
      await expect(page.getByRole("heading", { name: /Агент сможет$/ })).toBeVisible()
      await expect(page.getByText(/Прочитать файл «Качество данных\.lgp»/)).toBeVisible()
      await expect(page.getByText(`Создать документы «${wizardPDF}», «${wizardWord}»`, { exact: false })).toBeVisible()
      await expect(page.getByRole("heading", { name: /Агент не сможет$/ })).toBeVisible()
      await expect(page.getByText("Подключаться к Loginom и открывать браузер", { exact: true })).toBeVisible()
      await expect(page.getByText("Что увидит модель:", { exact: true })).toBeVisible()
      await expect(page.getByText(/структура пакета и настройки узлов/)).toBeVisible()
      await page.getByRole("button", { name: "Разрешить и запустить" }).click()
    })
    await test.step.skip(
      "LAB-2179 · Увидеть результат мастера «Проверено приложением» и открыть «Обсудить в чате»",
      async () => {
        await expect(page.getByText(/^Проверено приложением:?$/)).toBeVisible()
        await page.getByRole("button", { name: "Обсудить в чате" }).click()
        await expect(page).toHaveURL(/\/new-session\?draftId=/)
        await expect(gateEditor(page)).toContainText("Разберём результат запуска")
        const attachments = page.locator('[data-component="composer-attachments"]')
        await expect(attachments.getByText(wizardPDF, { exact: true })).toBeVisible()
        await expect(attachments.getByText(wizardWord, { exact: true })).toBeVisible()
      },
    )
  })
})

test("Сценарий 4. Правила отдела", async ({ page, baseURL }, info) => {
  await withGate(page, baseURL, "instructions", async ({ url, requests, calls }) => {
    const rules =
      "Узлы называй по смыслу, по-русски. Перед расчётом выручки — проверка пустых значений. В каждом модуле — заметка: что делает и кто отвечает."
    const receipt = { operation_id: "gate-read-sales", package_path: "/user/Продажи.lgp", status: "SUCCEEDED" }
    const readingRequest = () =>
      requests.find((request) =>
        gateToolReceipts(request).some(
          (reply) =>
            !!reply &&
            typeof reply === "object" &&
            "operation_id" in reply &&
            reply.operation_id === receipt.operation_id &&
            "package_path" in reply &&
            reply.package_path === receipt.package_path &&
            "status" in reply &&
            reply.status === receipt.status,
        ),
      )
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
      await expect(page.getByText(answer, { exact: true })).toBeVisible()
      await expect.poll(readingRequest).toBeDefined()
      expect(calls).toEqual([expect.objectContaining({ intent: "open_package", package_path: receipt.package_path })])
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
