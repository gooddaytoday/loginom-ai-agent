import { expect, test } from "@playwright/test"
import { gatePrompts, salesCsv, salesFile } from "../../../server/test/fixture/loginom-gate-scenarios"
import { gateScreenshot, withLoginomGate } from "../utils/loginom-gate"

test.fixme("7 · Каталог и своё (LAB-2181)", async ({ page, baseURL }, info) => {
  if (!baseURL) throw new Error("Missing Playwright app URL")
  await withLoginomGate({ page, baseURL, scenario: "7", info }, async () => {
    await test.step("Открыть каталог, выбрать «Сообщество» и проверить разрешения", async () => {
      await page.getByText("Каталог", { exact: true }).click()
      await page.getByRole("button", { name: "Сообщество", exact: true }).click()
      await expect(page.getByText("Что будет разрешено", { exact: true })).toBeVisible()
      await gateScreenshot(page, info, "07-catalog")
    })
    await test.step.skip(
      "LAB-2181 · установить навык только после согласия и увидеть его в «Установленных»",
      async () => {},
    )
    await test.step.skip(
      "LAB-2181 · открыть «Создать своё». Создание, проба, включение и публикация требуют отдельной реализации",
      async () => {},
    )
  })
})

test("8 · Сбои", async ({ page, baseURL }, info) => {
  if (!baseURL) throw new Error("Missing Playwright app URL")
  await withLoginomGate({ page, baseURL, scenario: "8", info }, async (gate) => {
    await test.step("Поставить поправку в очередь, пока Loginom читает пакет", async () => {
      await gate.editor.fill(gatePrompts.read)
      await gate.submit.click()
      await expect.poll(gate.status).toMatchObject({ waitingRead: true, calls: ["dock_prepare", "dock_inspect"] })
      await gate.editor.fill(gatePrompts.reread)
      await gate.editor.press("Alt+Enter")
      const queued = page.locator('[data-component="session-queue-row"]')
      await expect(queued.getByRole("button", { name: gatePrompts.reread, exact: true })).toBeVisible()
      await gateScreenshot(page, info, "08-queued-during-read")
    })
    await test.step("Увидеть сбой чтения и результат поправки после возврата Loginom", async () => {
      await gate.releaseRead()
      await expect(page.getByText("Шаг чтения не выполнен: Loginom недоступен.", { exact: true })).toBeVisible()
      await expect(
        page.getByText("Loginom снова доступен. Прочитана версия v1 пакета Продажи.lgp.", { exact: true }),
      ).toBeVisible()
      await expect(page.locator('[data-component="session-queue-row"]')).toHaveCount(0)
      await gateScreenshot(page, info, "08-read-recovered")
    })
    await test.step("После обрыва записи запросить проверку и увидеть подтверждённую версию", async () => {
      await gate.editor.fill(gatePrompts.write)
      await gate.submit.click()
      await expect(
        page.getByText("Исход записи не подтверждён. Нужно проверить состояние пакета.", { exact: true }),
      ).toBeVisible()
      await gateScreenshot(page, info, "08-write-unconfirmed")
      expect(await gate.status()).toMatchObject({
        calls: ["dock_prepare", "dock_inspect", "dock_inspect", "dock_action_run"],
      })
      await gate.editor.fill(gatePrompts.check)
      await gate.submit.click()
      await expect(page.getByText("Проверка пакета подтвердила версию v1.", { exact: true })).toBeVisible()
      expect(await gate.status()).toMatchObject({
        calls: ["dock_prepare", "dock_inspect", "dock_inspect", "dock_action_run", "dock_inspect"],
      })
    })
    await test.step.skip(
      "LAB-2216, LAB-2234, LAB-2225 · таймеры долгого шага, подсказка задержки и «После хода»",
      async () => {},
    )
    await test.step.skip(
      "LAB-2199, LAB-2228 · кнопки проверки, блокировка повтора записи и повтор чтения",
      async () => {},
    )
    await test.step.skip("LAB-2208 · прерванный при закрытии ход и продолжение с подтверждённого шага", async () => {})
    await test.step.skip("LAB-2196 · пакет в другом разговоре, Studio или осиротевшей сессии", async () => {})
    await test.step.skip("LAB-2143, LAB-2235 · одинаковые вызовы и решение пользователя", async () => {})
    await test.step.skip("LAB-2165, LAB-2200 · лимит модели и уведомления", async () => {})
  })
})

test("9 · Закрытый контур", async ({ page, baseURL }, info) => {
  if (!baseURL) throw new Error("Missing Playwright app URL")
  await withLoginomGate({ page, baseURL, scenario: "9", info }, async (gate) => {
    await test.step("Увидеть разрешённую модель в выборе и получить ответ", async () => {
      await gate.model.click()
      const picker = page.getByRole("dialog", { name: "Select model", exact: true })

      const allowed = picker
        .getByRole("option", { name: /^Модель организации/ })
        .or(picker.getByRole("button", { name: "Модель организации", exact: true, pressed: true }))

      const denied = picker
        .getByRole("option", { name: /^Модель из интернета/ })
        .or(picker.getByRole("button", { name: "Модель из интернета", exact: true }))

      await expect(allowed).toBeVisible()
      await expect(denied).toHaveCount(0)
      await gateScreenshot(page, info, "09-allowed-model")
      await page.keyboard.press("Escape")
      await expect(picker).toBeHidden()

      await gate.editor.fill(gatePrompts.closed)
      await gate.submit.click()
      await expect(page.getByText("Отвечаю моделью организации.", { exact: true })).toBeVisible()
    })
    await test.step.skip(
      "LAB-2207 · режим сети и пометка «Задано администратором» (политика закрытого контура — этап F)",
      async () => {},
    )
    await test.step.skip(
      "LAB-2181 · получить файл «Контроль полноты загрузок» и импортировать через каталог (доставка Hub — этап E)",
      async () => {},
    )
  })
})

test("10 · Собрать вместе с Loginom", async ({ page, baseURL }, info) => {
  if (!baseURL) throw new Error("Missing Playwright app URL")
  await withLoginomGate({ page, baseURL, scenario: "10", info }, async (gate) => {
    await test.step("Приложить sales-demo.csv и импортировать 12 строк", async () => {
      await page.locator('input[type="file"]').setInputFiles({
        name: salesFile,
        mimeType: "text/csv",
        buffer: Buffer.from(salesCsv),
      })
      await expect(
        page.locator('[data-component="composer-attachments"]').getByText(salesFile, { exact: true }),
      ).toBeVisible()
      await gate.editor.fill(gatePrompts.import)
      await gate.submit.click()
      await expect(page.getByText("Узел «Импорт текста» выполнен. Прочитано 12 строк.", { exact: true })).toBeVisible()
      await gateScreenshot(page, info, "10-import-12-rows")
    })
    await test.step.skip(
      "LAB-2185, LAB-2188, LAB-2234 · показать окно рядом с чатом и предупреждение о правках во время шага",
      async () => {},
    )
    await test.step.skip("LAB-2189, LAB-2226 · ручная правка графа, конфликт и повтор с текущей схемой", async () => {})
    await test.step("Попросить фильтр за 2026 год и получить 8 строк", async () => {
      await gate.editor.fill(gatePrompts.filter)
      await gate.submit.click()
      await expect(
        page.getByText("Узел «Фильтр строк» подключён к импорту и выполнен. За 2026 год осталось 8 строк.", {
          exact: true,
        }),
      ).toBeVisible()
      expect(await gate.status()).toMatchObject({
        calls: ["dock_prepare", "dock_artifact_deliver", "dock_node_apply", "dock_node_apply"],
      })
      await gateScreenshot(page, info, "10-filter-8-rows")
    })
    await test.step("Попросить сохранить и увидеть путь из квитанции", async () => {
      await gate.editor.fill(gatePrompts.save)
      await gate.submit.click()
      await expect(page.getByText("Пакет сохранён в Loginom по пути /gate/Продажи.lgp.", { exact: true })).toBeVisible()
      expect(await gate.status()).toMatchObject({
        calls: ["dock_prepare", "dock_artifact_deliver", "dock_node_apply", "dock_node_apply", "dock_action_run"],
      })
      await gateScreenshot(page, info, "10-save")
    })
    await test.step.skip(
      "LAB-2190, LAB-2226, LAB-2224 · перечитать сохранённый пакет, показать переименование и «Проверено приложением»",
      async () => {},
    )
    await test.step.skip(
      "LAB-2229, LAB-2222 · строка пакета, список окон и диалог закрытия с несохранёнными изменениями",
      async () => {},
    )
  })
})
