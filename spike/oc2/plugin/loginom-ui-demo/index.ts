// UI spike (part 2): Loginom-like tools so the real OpenCode feed has something to show — steps, a permission
// for writing to Loginom, a change set for the change card, and a failing call. Outputs are canned, nothing runs.
import { Plugin } from "@opencode/plugin"

const changes = [
  { kind: "mod", node: "Фильтр по дате", what: "перенесён до разветвления" },
  { kind: "del", node: "Фильтр по дате (ветка «Города»)", what: "дублировал первый" },
  { kind: "mod", node: "Узел14 → «Выручка по городам»", what: "переименован" },
  { kind: "add", node: "Проверка пустых значений", what: "новый узел" },
]

export default Plugin.define({
  id: "loginom.ui-demo",
  async setup(ctx) {
    await ctx.tool.transform((editor) => {
      editor.add({
        name: "loginom_table_read",
        description: "Read a table that Loginom can use.",
        input: { type: "object", properties: { file: { type: "string" } } },
        options: { codemode: false },
        execute: async () => ({ content: "2 400 строк, 6 столбцов: дата, товар, регион, количество, цена, выручка" }),
      })
      editor.add({
        name: "loginom_scenario_build",
        description: "Build a scenario in Loginom.",
        input: { type: "object", properties: { nodes: { type: "array", items: { type: "string" } } } },
        options: { codemode: false },
        execute: async () => ({ content: "Сценарий из 4 узлов: Импорт CSV → Группировка → Сортировка → ABC-классификация" }),
      })
      editor.add({
        name: "loginom_scenario_run",
        description: "Run the scenario on the demo data.",
        input: { type: "object", properties: {} },
        options: { codemode: false },
        execute: async () => {
          await new Promise((resolve) => setTimeout(resolve, 2500))
          return { content: "120 товаров: A — 15, B — 28, C — 77 · 1,2 с" }
        },
      })
      editor.add({
        name: "loginom_package_save",
        description: "Save a package to the user's Loginom folder.",
        input: { type: "object", properties: { name: { type: "string" }, folder: { type: "string" } } },
        options: { codemode: false },
        execute: async (input, context) => {
          const { name, folder } = input as { name: string; folder: string }
          await ctx.permission.assert({
            sessionID: context.sessionID,
            action: "loginom.package.save",
            resources: [`${folder}/${name}`],
            metadata: { title: `Сохранить новый пакет «${name}» в Loginom?`, effect: "Появится новый пакет; другие пакеты не изменятся" },
          })
          return { content: `Сохранён «${name}» в ${folder}` }
        },
      })
      editor.add({
        name: "loginom_package_edit",
        description: "Change a working copy of a package.",
        input: { type: "object", properties: { name: { type: "string" } } },
        options: { codemode: false },
        execute: async () => ({ content: JSON.stringify({ package: "Продажи.lgp", copy: true, changes }), metadata: { changes } }),
      })
      editor.add({
        name: "loginom_flaky",
        description: "A Loginom call that fails.",
        input: { type: "object", properties: {} },
        options: { codemode: false },
        execute: async () => {
          throw new Error("Loginom не ответил за 30 с (app.loginom.ai)")
        },
      })
    })
  },
})
