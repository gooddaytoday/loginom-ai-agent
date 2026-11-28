import { expect, test } from "@playwright/test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { gateEditor, gateScreenshot, sendGatePrompt, withGate } from "../utils/gate"
import { gateScenarios, gateToolReplies } from "../utils/gate-scenarios"
import { APP_READY_TIMEOUT } from "../utils/waits"

test("Сценарий 1. Первый запуск", async ({ page }, info) => {
  await withGate(page, "first", async ({ requests, calls }) => {
    await test.step("В новом разговоре модель уже выбрана", async () => {
      await expect(gateEditor(page)).toBeEditable({ timeout: APP_READY_TIMEOUT })
      await expect(page.locator('[data-action="composer-model"]:visible')).toContainText("Тестовая модель")
      await gateScreenshot(page, info, "1-new-conversation")
    })
    await test.step.skip("LAB-2151 · Стартовый экран и примеры задач", async () => {
      await expect(page.getByText("Примеры задач", { exact: true })).toBeVisible()
    })
    await test.step.skip("LAB-2169 / LAB-2130 · Подключить учебный или свой Loginom и увидеть адрес", async () => {
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

test("Сценарий 2. Описать пакет для коллеги", async ({ page }, info) => {
  await withGate(page, "documentation", async ({ directory, requests }) => {
    await test.step.skip("LAB-2177 / LAB-2178 · Выбрать пакет «Качество данных» из Loginom", async () => {
      await page.getByText("Качество данных", { exact: true }).click()
    })
    await test.step.skip("LAB-2179 · Добавить Word, прочитать «Доступ» и разрешить запуск мастера", async () => {
      await page.getByRole("checkbox", { name: "Word" }).check()
      await page.getByRole("button", { name: "Разрешить и запустить" }).click()
    })
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
      const toolReplies = JSON.stringify(gateToolReplies(requests.at(-1)).slice(-2))
      expect(toolReplies).toContain(pdf)
      expect(toolReplies).toContain(word)
      const [pdfBytes, wordBytes] = await Promise.all([
        readFile(path.join(directory, pdf)),
        readFile(path.join(directory, word)),
      ])
      expect(pdfBytes.subarray(0, 5).toString()).toBe("%PDF-")
      expect(wordBytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
      await info.attach(pdf, { body: pdfBytes, contentType: "application/pdf" })
      await info.attach(word, {
        body: wordBytes,
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      })
      await gateScreenshot(page, info, "2-documentation-in-chat")
    })
    await test.step.skip(
      "LAB-2179 · Увидеть результат мастера «Проверено приложением» и открыть «Обсудить в чате»",
      async () => {
        await expect(page.getByText("Проверено приложением", { exact: true })).toBeVisible()
        await page.getByRole("button", { name: "Обсудить в чате" }).click()
      },
    )
  })
})

test("Сценарий 4. Правила отдела", async ({ page }, info) => {
  await withGate(page, "instructions", async ({ requests, calls }) => {
    await test.step.skip("LAB-2147 · Сохранить правила отдела в настройках инструкций", async () => {
      await page.getByRole("button", { name: "Инструкции", exact: true }).click()
      await page
        .getByRole("textbox")
        .fill(
          "Узлы называй по смыслу, по-русски. Перед расчётом выручки — проверка пустых значений. В каждом модуле — заметка: что делает и кто отвечает.",
        )
      await page.getByRole("button", { name: "Сохранить", exact: true }).click()
    })
    await test.step("В новом разговоре проверить «Продажи» и увидеть замечание по прочитанному пакету", async () => {
      const { prompt, answer } = gateScenarios.instructions
      await sendGatePrompt(page, prompt)
      await expect(page.getByText(answer, { exact: true })).toBeVisible()
      expect(gateToolReplies(requests.at(-1)).at(-1)).toContain("gate-read-sales")
      expect(calls).toEqual([expect.objectContaining({ intent: "open_package", package_path: "/user/Продажи.lgp" })])
      await gateScreenshot(page, info, "4-sales-review")
    })
    await test.step.skip("LAB-2174 / LAB-2147 · Модель получила сохранённые правила в новом разговоре", async () => {
      expect(JSON.stringify(requests[0])).toContain("Узлы называй по смыслу, по-русски")
    })
    await test.step.skip("LAB-2147 · В ленте видно «Учёл ваши инструкции» и замечание по ним", async () => {
      await expect(page.getByText(/учёл ваши инструкции/i)).toBeVisible()
      await expect(page.getByText(/по вашим инструкциям/i)).toBeVisible()
    })
  })
})
