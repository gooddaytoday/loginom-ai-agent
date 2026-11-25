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
  // Internal guard below the owner's 40 000 B SKILL.md budget (raised for LAB-2020; never above 39 000).
  expect(Buffer.byteLength(skill)).toBeLessThanOrEqual(38_500)
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

// #1290/#1291, bughunt bh-b04/bh-a10/s1 (0.4.1): the agent waited with shell `sleep` (530–705 s per run),
// unzipped an attached .lgp to read its XML and read or created files outside the working directory.
test("workflow reference allows waiting only through Loginom tools and keeps files inside the task", () => {
  expect(boundaries).toMatch(/Ожидай только `loginom_dock_node_wait`[\s\S]*?60 с[\s\S]*?тем же `operation_id`/)
  expect(boundaries).toContain("`loginom_dock_operation_inspect`")
  expect(boundaries).toContain("shell `sleep`")
  expect(boundaries).toMatch(/Приложенный `\.lgp` открывай `loginom_dock_prepare`[\s\S]*?не распаковывай/)
  expect(boundaries).toMatch(/вне рабочего каталога и вложений[\s\S]*?не читай и не создавай/)
  expect(boundaries).toContain("справку этого skill")
})

// LAB-2015/LAB-2020, bughunt bh-g101..g106 (0.4.3): every user message is a new task whose profile starts
// without the skill (task-scope.ts derive), so loginom_dock_* stayed hidden until the skill was activated again.
// LAB-2027: a later message of the same chat inherits the activation (turn-lifecycle.ts beforeTurn), so only
// the first scenario message activates it; a repeated activation on every message is an unneeded skill call.
// Before activation only the frontmatter description reaches the model.
// Help questions and dashboard chats must not activate it: dashboards have no Loginom connection
// (turn-lifecycle.ts) and activation there fails with LOGINOM_SCOPE_DENIED.
test("description makes the first scenario message of a chat activate the skill and says it persists", () => {
  const description = skill
    .split("\n---\n")[0]
    .split(/\ndescription: >-\n/)[1]
    ?.split(/\n[a-z]+:/)[0]
    .replace(/\s+/g, " ")
  expect(description).toBeDefined()
  const rule = description?.match(/Первое сообщение чата[^.:]*начинай с активации этого skill[^.]*\./)?.[0]
  expect(rule).toBeDefined()
  expect(rule).toContain("о сценарии или пакете Loginom")
  expect(rule).toContain("в следующих сообщениях этого чата она сохраняется")
  expect(description).not.toMatch(/[Кк]аждое новое сообщение|история их не возвращает/)
  expect(description).toContain("обычные справочные вопросы используют Help без этого skill")
  expect(description!.length).toBeLessThanOrEqual(1024)
  expect(skill).toContain("`existing_workflow` — только со ссылкой, выданной этим runtime, не из истории чата.")
})
