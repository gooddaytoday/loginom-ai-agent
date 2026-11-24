import { expect, test } from "bun:test"

const read = (path: string) => Bun.file(new URL(`../skills/loginom-automation/${path}`, import.meta.url)).text()
const skill = await read("SKILL.md")
const workflow = await read("references/workflow.md")
const excel = await read("references/nodes/imports.excel.md")
const boundaries = workflow.split("\n## Границы действий\n")[1] ?? ""

// Bughunt bh-a11/bh-a05/bh-a09, #1251: after refusals the agent read product logs and sources,
// computed totals in local Python, converted data without consent, and created a doomed 70-column Import.
test("entry keeps the action boundaries visible before any reference is read", () => {
  const entry = skill.split("\n## ")[0]
  expect(entry).toContain("Итоги считает Loginom, не локальный Python/bash")
  expect(entry).toContain("`loginom_file_profile`")
  expect(entry).toContain("только его `next_step`/recovery, затем отчёт о блокере")
  expect(entry).toContain("без чтения\nжурналов, diagnostics и исходников продукта")
  expect(entry).toContain("Конвертация и производные файлы — с\nсогласия")
  expect(entry).toContain("[границы](references/workflow.md#границы-действий)")
  expect(Buffer.byteLength(skill)).toBeLessThanOrEqual(36_298 + 2_000)
})

test("workflow reference defines Loginom-only results, standard recovery and consent", () => {
  expect(boundaries).not.toBe("")
  expect(boundaries).toContain("Результаты считает Loginom")
  expect(boundaries).toContain("Не считай и не сверяй итоги локальным Python/bash/awk")
  expect(boundaries).toContain("не через\nopenpyxl/pandas/csv")
  expect(boundaries).toMatch(/USER_RESPONSE_BUDGET[\s\S]*?только штатно[\s\S]*?next_step[\s\S]*?recovery_options/)
  expect(boundaries).toContain("остановись и сообщи блокер")
  for (const internal of ["журналы", "`diagnostics/`", "`events.jsonl`", "исходники или бинарник установленного CLI"])
    expect(boundaries).toContain(internal)
  expect(boundaries).toContain("Читать можно только\nсправку этого skill")
  expect(boundaries).toContain("не из журналов")
  expect(boundaries).toContain("SQLite")
  expect(boundaries).toContain("только с явного согласия\nпользователя")
  expect(boundaries).toMatch(/64 столбца[\s\S]*?до `loginom_dock_node_apply`[\s\S]*?Не\nсоздавай пустой или неполный импорт/)
})

test("Excel card reports the 64-column limit before creating the Import", () => {
  expect(excel).toContain("«Excel runtime supports 1–64 columns»")
  expect(excel).toContain("до `node_apply`: Import не создавай, книгу без согласия не конвертируй")
  expect(excel).toContain("запрошенный пакет сохрани без этого узла")
  expect(Buffer.byteLength(excel)).toBeLessThanOrEqual(12_000)
})
