import { expect, test, type Page } from "@playwright/test"
import { gatePrompts, salesCsv, salesFile } from "../../../server/test/fixture/loginom-gate-scenarios"
import { gateScreenshot, withLoginomGate } from "../utils/loginom-gate"

async function openCatalog(page: Page, title: string) {
  const tabs = page.locator('[data-slot="mobile-tabs-trigger"]')

  if (await tabs.isVisible()) await tabs.click()
  await page.getByRole("navigation").getByRole("button", { name: title, exact: true }).click()
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible()
}

test("7 · Каталог и своё", async ({ page, baseURL }, info) => {
  if (!baseURL) throw new Error("Missing Playwright app URL")
  await withLoginomGate({ page, baseURL, scenario: "7", info }, async () => {
    await test.step("Открыть каталог и карточку комплектного действия", async () => {
      await openCatalog(page, "Каталог")
      const cards = page.getByRole("article")
      await expect(cards.getByRole("heading")).toHaveText([
        "Построить сценарий Loginom",
        "Документировать",
        "Создать дашборд",
        "Проверить",
      ])
      await expect(page.getByRole("button", { name: "Создать своё", exact: true })).toBeDisabled()
      await gateScreenshot(page, info, "07-catalog")

      const tier = page.getByRole("group", { name: "Кто подготовил" })
      await tier.getByRole("button", { name: "Сообщество", exact: true }).click()
      await expect(cards).toHaveCount(0)
      await expect(page.getByText("Ничего не нашлось", { exact: true })).toBeVisible()
      await tier.getByRole("button", { name: "Loginom", exact: true }).click()

      const card = cards.filter({ has: page.getByRole("heading", { name: "Документировать", exact: true }) })
      await card.getByRole("button", { name: "Запустить", exact: true }).click()
      const detail = page.getByRole("dialog", { name: "Документировать", exact: true })
      await expect(detail.getByRole("heading", { name: "Что будет разрешено" })).toBeVisible()
      await expect(detail.getByText("Подготовлено и поддерживается Loginom.", { exact: true })).toBeVisible()
      await expect(
        detail.getByText("Прочитать локальный пакет и создать документ встроенным генератором.", { exact: true }),
      ).toBeVisible()
      await gateScreenshot(page, info, "07-catalog-permissions")
    })
    await test.step.skip("В-49, этап E (контекст LAB-2181) · подтвердить установку элемента сообщества", async () => {})
    await test.step.skip(
      "В-34, В-42 (контекст LAB-2181) · «Создать своё»: авторинг, проба, включение и публикация",
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
      await expect
        .poll(gate.status)
        .toMatchObject({ waitingRead: true, calls: ["dock_prepare", "dock_workspace_observe"] })
      await gate.editor.fill(gatePrompts.queue)
      await gate.editor.press("Alt+Enter")
      const queued = page.locator('[data-component="session-queue-row"]')
      const correction = queued.getByRole("button", { name: gatePrompts.queue, exact: true })
      await expect(correction).toBeInViewport({ ratio: 1 })
      await expect(page.locator("[data-moving]").filter({ has: correction })).toHaveCount(0)
      await gateScreenshot(page, info, "08-queued-during-read")
    })
    await test.step("Дождаться успешного чтения и отправки поправки из очереди", async () => {
      await gate.releaseRead()
      await expect(page.getByText("В пакете Продажи.lgp найден узел «Фильтр».", { exact: true })).toBeVisible()
      await expect(page.getByText("Путь пакета — /gate/Продажи.lgp.", { exact: true })).toBeVisible()
      await expect(page.locator('[data-component="session-queue-row"]')).toHaveCount(0)
      expect(await gate.status()).toMatchObject({ calls: ["dock_prepare", "dock_workspace_observe"] })
    })
    await test.step("После обрыва записи запросить проверку и увидеть подтверждение сохранения", async () => {
      await gate.editor.fill(gatePrompts.write)
      await gate.submit.click()
      await expect(
        page.getByText("Исход записи не подтверждён. Нужно проверить состояние пакета.", { exact: true }),
      ).toBeVisible()
      await gateScreenshot(page, info, "08-write-unconfirmed")
      expect(await gate.status()).toMatchObject({
        calls: ["dock_prepare", "dock_workspace_observe", "dock_action_run"],
        saveBrowserCalls: ["prepare:gate-write", "apply:gate-write"],
      })
      await gate.editor.fill(gatePrompts.check)
      await gate.submit.click()
      await expect(page.getByText("Проверка подтвердила сохранение пакета Продажи.lgp.", { exact: true })).toBeVisible()
      expect(await gate.status()).toMatchObject({
        calls: ["dock_prepare", "dock_workspace_observe", "dock_action_run", "dock_operation_inspect"],
        saveBrowserCalls: ["prepare:gate-write", "apply:gate-write", "receipt:gate-write"],
      })
    })
    await test.step("LAB-2235 · свернуть повторы в одну строку и остановить третий вызов", async () => {
      const question = page.locator('[data-component="dock-prompt"][data-kind="question"]')
      const repeats = page.locator('[data-component="tool-group-row"]')
      await expect(repeats).toHaveCount(0)
      await gate.editor.fill(gatePrompts.repeat)
      await gate.submit.click()
      await expect(
        question.getByText(
          "Агент собирается в третий раз вызвать применение настроек узла Loginom с теми же параметрами.",
          { exact: true },
        ),
      ).toBeVisible()
      await expect(repeats).toHaveCount(1)
      await expect(repeats).toHaveText("Агент дважды вызвал применение настроек узла Loginom с теми же параметрами")
      const before = ["dock_prepare", "dock_workspace_observe", "dock_action_run", "dock_operation_inspect"]
      const stoppedCalls = [...before, "dock_action_describe", "dock_node_apply", "dock_node_apply"]
      expect((await gate.status()).calls).toEqual(stoppedCalls)
      await gateScreenshot(page, info, "08-repeat-question")
      await question.getByRole("button", { name: "Остановить", exact: true }).click()
      await expect(question).toHaveCount(0)
      await expect(gate.editor).toBeEditable()
      await expect(gate.submit).toBeDisabled()
      await expect(repeats).toHaveCount(1)
      expect((await gate.status()).calls).toEqual(stoppedCalls)
    })
    await test.step.skip(
      "LAB-2216, LAB-2234, LAB-2225 · таймеры долгого шага, подсказка задержки и «После хода»",
      async () => {},
    )
    await test.step.skip(
      "LAB-2199, LAB-2228 · кнопки проверки, блокировка повтора записи и повтор чтения",
      async () => {},
    )
    await test.step.skip("Б4 · UI «Ход прерван» и «Продолжить» (ядро LAB-2208 уже в базе)", async () => {})
    await test.step.skip(
      "LAB-2216, LAB-2228 · один автоповтор чтения, затем остановка после второго отказа",
      async () => {
        await gate.editor.fill(gatePrompts.outage)
        await gate.submit.click()

        const trace = [
          "dock_prepare",
          "dock_workspace_observe",
          "dock_action_run",
          "dock_operation_inspect",
          "dock_action_describe",
          "dock_node_apply",
          "dock_node_apply",
          "dock_workspace_observe",
          "dock_workspace_observe",
        ]

        await expect.poll(async () => (await gate.status()).calls).toEqual(trace)
        await expect(page.getByText("Шаг не выполнен", { exact: true })).toBeVisible()
        await expect(page.getByRole("button", { name: "Повторить шаг", exact: true })).toBeDisabled()
        expect((await gate.status()).calls).toEqual(trace)
      },
    )
    await test.step.skip("LAB-2196 · пакет в другом разговоре, Studio или осиротевшей сессии", async () => {})
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
    await test.step("Открыть каталог из приложения", async () => {
      await openCatalog(page, "Catalog")
    })
    await test.step.skip("В-51 · импортировать файл «Контроль полноты загрузок» из каталога", async () => {})
    await test.step.skip(
      "Этап E, В-51 · скачать дополнение с сайта Hub и передать файл в закрытый контур",
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
      await expect(
        page.getByText("Узел «Импорт» подключён к узлу «Результат». В узле «Результат» 12 строк.", { exact: true }),
      ).toBeVisible()
      expect(await gate.status()).toMatchObject({ graph: { links: ["import→result"], resultRows: 12 } })
      await gateScreenshot(page, info, "10-import-12-rows")
    })
    await test.step.skip(
      "LAB-2185, LAB-2188, LAB-2234 · показать окно рядом с чатом и предупреждение о правках во время шага",
      async () => {},
    )
    await test.step.skip("LAB-2189, LAB-2226 · ручная правка графа, конфликт и повтор с текущей схемой", async () => {})
    await test.step("Вставить фильтр перед «Результат» и проверить 8 строк у «Результат»", async () => {
      await gate.editor.fill(gatePrompts.filter)
      await gate.submit.click()
      await expect(
        page.getByText(
          "Связь «Импорт → Результат» заменена на «Импорт → Фильтр → Результат». В узле «Результат» 8 строк за 2026 год.",
          {
            exact: true,
          },
        ),
      ).toBeVisible()
      expect(await gate.status()).toMatchObject({
        graph: {
          links: ["import→filter", "filter→result"],
          resultRows: 8,
        },
      })
      await gateScreenshot(page, info, "10-filter-8-rows")
    })
    await test.step("Попросить сохранить и увидеть путь из квитанции", async () => {
      await gate.editor.fill(gatePrompts.save)
      await gate.submit.click()
      await expect(page.getByText("Пакет сохранён в Loginom по пути /gate/Продажи.lgp.", { exact: true })).toBeVisible()
      expect(await gate.status()).toMatchObject({
        calls: [
          "dock_prepare",
          "dock_artifact_deliver",
          "dock_action_describe",
          "dock_node_apply",
          "dock_node_wait",
          "dock_action_describe",
          "dock_node_apply",
          "dock_node_wait",
          "dock_action_describe",
          "dock_node_apply",
          "dock_node_wait",
          "dock_node_apply",
          "dock_node_wait",
          "dock_action_run",
        ],
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
