// UI spike (part 2): a long-running sandbox server for the real OpenCode web app. Prints the scripted prompts.
//   bun ui.ts            → server on :4096 (the app's dev default), scripted model on :4097
import path from "node:path"
import { writeFileSync } from "node:fs"
import { makeEnv, PLUGIN, SPIKE } from "./env"
import { script } from "./mock-llm"

const DEMO = path.join(SPIKE, "plugin", "loginom-ui-demo")
// Saving a package asks the person, so the real permission dock appears (without the rule the demo tool runs unasked).
const env = await makeEnv("ui", {
  port: 4096,
  plugins: [PLUGIN, DEMO],
  extraConfig: { permissions: [{ action: "loginom.package.save", resource: "*", effect: "ask" }] },
})

const prompts = {
  feed: script([
    { tool: "loginom_table_read", input: { file: "sales-demo.csv" } },
    { tool: "loginom_scenario_build", input: { nodes: ["Импорт CSV", "Группировка", "Сортировка", "ABC"] } },
    { tool: "loginom_scenario_run", input: {} },
    { tool: "loginom_package_save", input: { name: "ABC-анализ.lgp", folder: "/user" } },
    { text: "Сценарий ABC-анализа собран: A — 15, B — 28, C — 77 товаров. Пакет «ABC-анализ.lgp» сохранён в /user." },
  ], "Построй ABC-анализ товаров по выручке"),
  question: script([
    { tool: "question", input: { questions: [{ question: "Какие строки считать дубликатами?", header: "Дубликаты", options: [
      { label: "Полное совпадение строки", description: "Все столбцы одинаковые" },
      { label: "Совпадение товара и даты", description: "Одна продажа записана дважды" },
    ] }] } },
    { text: "Нашёл 3 дубликата по выбранному правилу." },
  ], "Проверь выгрузку на дубликаты"),
  steer: script([{ hang: 20000 }, { text: "Готово." }], "Долгая задача"),
  change: script([
    { tool: "loginom_package_edit", input: { name: "Продажи.lgp" } },
    { text: "Изменил копию «Продажи.lgp»: +1 ~2 −1. Исходный пакет не менял." },
  ], "Внеси улучшения в Продажи.lgp"),
  error: script([{ tool: "loginom_flaky", input: {} }, { text: "Loginom не отвечает — повторю позже." }], "Сбой Loginom"),
}
writeFileSync(path.join(env.run, "prompts.json"), JSON.stringify(prompts, null, 2))
console.log(JSON.stringify({ ready: true, port: env.port, project: env.project, prompts: path.join(env.run, "prompts.json") }))
process.on("SIGTERM", () => { env.stop(); process.exit(0) })
await new Promise(() => {})
