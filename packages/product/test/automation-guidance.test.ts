import { expect, test } from "bun:test"

const skill = await Bun.file(new URL("../skills/loginom-automation/SKILL.md", import.meta.url)).text()
const chain = skill.split("## Один расчёт цепочки\n")[1].split("\n## Выбор узлов")[0]

test("missing Loginom connection directs the user to settings without searching for credentials", async () => {
  const browser = await Bun.file(new URL("../skills/loginom-automation/references/browser.md", import.meta.url)).text()
  expect(skill).toMatch(/LOGINOM_CONFIG_REQUIRED[\s\S]*?unconfigured[\s\S]*?references\/browser.md/)
  const entry = skill.split("\n## ")[0]
  expect(entry).toContain("открыть «Loginom»")
  expect(entry).toContain("адрес, логин и пароль")
  expect(entry).toContain("без поиска конфигураций/ключей")
  expect(browser).toContain("LOGINOM_CONFIG_REQUIRED")
  expect(browser).toContain("state=unconfigured")
  expect(browser).toContain("открыть «Loginom»")
  expect(browser).toContain("адрес, логин и пароль")
  expect(browser).toContain("повторить запрос")
  expect(browser).toContain("Не ищи причину в файлах")
  expect(browser).toContain("bash/PowerShell")
  expect(browser).toContain("чужие конфигурации и ключи")
  expect(browser).toContain("Не проси присылать пароль или API-ключ в чат")
})

test("sampling selects native modes through node-specific guidance", async () => {
  for (const type of ["preprocessing.sampling", "preprocessing.data_partition"]) {
    const settings = await Bun.file(new URL(`../skills/loginom-automation/references/nodes/${type}.md`, import.meta.url)).text()
    expect(skill).toContain(`[читать](references/nodes/${type}.md)`)
    expect(settings).toContain('mode:"biased"')
    expect(settings).toContain('strata_fields:[{kind:"input_field",name:"Class"}]')
    expect(settings).toContain('bias_factors:[{value:"A",factor:0.4},{value:"B",factor:1}]')
    expect(settings).toContain('используй существующий узел и `finish:"execute"`')
    expect(settings).toContain('Равномерный случайный метод: «Этот режим пока не поддерживается»')
    expect(skill + settings).not.toMatch(/\$(?:[1-9]\d*|ARGUMENTS)/)
  }
})

test("automation preserves technical output names explicitly requested by the user", () => {
  expect(skill).toMatch(/пользователь называет поле или колонку[\s\S]*?RequestId[\s\S]*?Key[\s\S]*?EchoPath/)
  expect(skill).toMatch(/выходное техническое имя[\s\S]*?ровно[\s\S]*?без приставок[\s\S]*?Returned[\s\S]*?переводов[\s\S]*?суффиксов/)
})

test("exports preserve NULL separately from empty strings with an explicit announced marker", async () => {
  const exports = await Bun.file(new URL("../skills/loginom-automation/references/nodes/exports.text.md", import.meta.url)).text()
  expect(exports).toContain("NULL и пустые строки")
  expect(exports).toContain("пользователь не задал маркер выгрузки")
  expect(exports).toContain("`exports.text`")
  expect(exports).toContain("`null_marker`")
  expect(exports).toContain("непустой маркер")
  expect(exports).toContain("не совпадающий с не-NULL значениями")
  expect(exports).toContain("тот же непустой маркер, что при импорте")
  expect(exports).toContain("иначе `NULL`")
  expect(exports).toContain("Назови выбранный маркер пользователю")
  expect(skill).not.toContain('используй `parameters:{null_marker:""}`')
  expect(exports).not.toMatch(/\$(?:1|ARGUMENTS)/)
})

test("single chain calculation permits source activation only after a safe preflight refusal", () => {
  expect(chain).toContain('finish:"done"')
  expect(chain).toContain("requires an active source output")
  expect(chain).toMatch(/NOT_APPLIED[\s\S]*?effect_possible:false[\s\S]*?cleanup_complete:true/)
  expect(chain).toMatch(/ближайш[\s\S]*?предыдущ[\s\S]*?один раз[\s\S]*?finish:"execute"/)
  expect(chain).toMatch(/повтори настройку[\s\S]*?новым operation_id/)
  expect(chain).toContain("не нарушает правило одного расчёта")
  expect(chain).toContain("Последний вычисляющий узел")
  expect(chain).toContain("После расчёта не вызывай")
})

test("REST JSON tables use the tabular path instead of the blanket tree instruction", async () => {
  const settings = await Bun.file(new URL("../skills/loginom-automation/references/nodes/trees.from_json.md", import.meta.url)).text()
  const trees = settings.split("## JSON в дерево и дерево в таблицу\n")[1]?.split("\n## ")[0] ?? ""
  const details = settings

  expect(trees).toMatch(/REST[\s\S]*?Калькулятор[\s\S]*?Свёртка[\s\S]*?Кросс-таблица/)
  expect(trees).toContain("по просьбе о дереве")
  expect(trees).toContain("без вложенных контейнеров")
  expect(trees).toContain("trees.from_json")
  expect(trees).toContain("trees.to_table")
  expect(details).toMatch(/Response[\s\S]*?RequestID[\s\S]*?HttpStatusCode/)
  expect(details).toContain("Nested containers in repeated records")
  expect(details).toContain("operation.recover")
  expect(details).toContain("не останавливай")
  expect(details).not.toContain("При отказе области поддержки\nсообщи ограничение")
})

test("relocated large-file and JavaScript rules stay reachable from the entry", async () => {
  const references = new URL("../skills/loginom-automation/references/", import.meta.url)
  const large = await Bun.file(new URL("large-files.md", references)).text()
  const javascript = await Bun.file(new URL("nodes/programming.javascript.md", references)).text()
  expect(skill).toMatch(/XLSX любого размера[\s\S]*?16 МиБ[\s\S]*?10 МиБ[\s\S]*?неизвестного размера[\s\S]*?\(references\/large-files.md\)/)
  expect(skill).toContain("полный расчёт будет после загрузки полного файла")
  expect(large).toContain("число `expected_records` передавать запрещено")
  expect(large).toContain("(workflow.md#серверный-источник-и-cache)")
  expect(skill).toMatch(/Узел JavaScript разрешён только[\s\S]*?\(references\/nodes\/programming.javascript.md\)/)
  expect(skill).toContain("Существующие JS-узлы не удаляй автоматически")
  expect(javascript).toContain("не являются таким пробелом")
})
