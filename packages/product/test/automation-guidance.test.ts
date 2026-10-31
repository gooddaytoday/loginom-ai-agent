import { expect, test } from "bun:test"

const skill = await Bun.file(new URL("../skills/loginom-automation/SKILL.md", import.meta.url)).text()
const chain = skill.split("## Один расчёт цепочки\n")[1].split("\n## Выбор узлов")[0]

test("sampling advertises random and explicitly refuses deferred modes", () => {
  expect(skill).toContain('mode:"random"')
  expect(skill).toContain('«Этот режим пока не поддерживается»')
  expect(skill).toContain('Не подменяй эти режимы другим алгоритмом')
  expect(skill).not.toContain('mode:"stratified"')
  expect(skill).not.toContain('mode:"biased"')
})

test("automation preserves technical output names explicitly requested by the user", () => {
  expect(skill).toMatch(/пользователь называет поле или колонку[\s\S]*?RequestId[\s\S]*?Key[\s\S]*?EchoPath/)
  expect(skill).toMatch(/выходное техническое имя[\s\S]*?ровно[\s\S]*?без приставок[\s\S]*?Returned[\s\S]*?переводов[\s\S]*?суффиксов/)
})

test("exports preserve NULL separately from empty strings with an explicit announced marker", () => {
  const exports = skill.split("## Экспорт\n")[1]?.split("\n## ")[0] ?? ""
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
