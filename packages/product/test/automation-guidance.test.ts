import { expect, test } from "bun:test"

const skill = await Bun.file(new URL("../skills/loginom-automation/SKILL.md", import.meta.url)).text()
const chain = skill.split("## Один расчёт цепочки\n")[1].split("\n## Выбор узлов")[0]

test("automation preserves technical output names explicitly requested by the user", () => {
  expect(skill).toMatch(/пользователь называет поле или колонку[\s\S]*?RequestId[\s\S]*?Key[\s\S]*?EchoPath/)
  expect(skill).toMatch(/выходное техническое имя[\s\S]*?ровно[\s\S]*?без приставок[\s\S]*?Returned[\s\S]*?переводов[\s\S]*?суффиксов/)
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
