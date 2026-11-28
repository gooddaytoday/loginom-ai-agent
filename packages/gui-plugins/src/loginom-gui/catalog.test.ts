import { expect, test } from "bun:test"
import { readdirSync } from "node:fs"
import { bundledItems } from "./catalog"
import en from "./i18n/en"
import ru from "./i18n/ru"

const source = new URL("../../../product/skills/", import.meta.url)

test("the installed catalog lists every shipped skill-backed entry", () => {
  const skillNames = readdirSync(source, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)

  const installed = bundledItems.filter((item) => item.installed)
  expect(skillNames.sort()).toEqual(installed.map((item) => item.id).sort())
})

const permissions = {
  "loginom-automation": ["Файлы задания ищи только", "Не обходи отказ рантайма"],
  "loginom-dashboard": ["2. Вызови `dashboard_draft`", "4. Публикуй только", "- Вызывай `dashboard_delete` только"],
  "package-docs": ["- Не создавать, не изменять", "- Не открывать браузер", "- Не искать и не скачивать", "  `package_docs_run`."],
  "package-linter": ["Используй обычные builtin", "Результат — один `<имя>_lint.md`"],
} satisfies Record<(typeof bundledItems)[number]["id"], string[]>

// Review source and display together when a skill's capabilities, limits or requirements change.
for (const { id } of bundledItems) {
  test(`${id}: catalog permissions and compatibility against the shipped skill`, async () => {
    const markdown = await Bun.file(new URL(`${id}/SKILL.md`, source)).text()
    const [, frontmatter, ...body] = markdown.split(/^---$/m)

    expect(frontmatter).toContain("compatibility")

    const lines = body.join("---").split("\n")
    const rules = permissions[id].map((prefix) => lines.find((line) => line.startsWith(prefix)))
    expect(rules).not.toContain(undefined)

    const copy = (locale: typeof en) => ({
      can: locale[`catalog.item.${id}.can`],
      cannot: locale[`catalog.item.${id}.cannot`],
      compatibility: locale[`catalog.item.${id}.compatibility`],
    })

    expect({ frontmatter: frontmatter.trim().split("\n"), rules, en: copy(en), ru: copy(ru) }).toMatchSnapshot()
  })
}
