import { expect, test } from "bun:test"
import { dict } from "./i18n/ru"
import { decodeFacts, failureTitle, loginomStepPhrase } from "./step-phrase"
import { Option } from "effect"

const messages = Object.entries(dict)

const rules = new Intl.PluralRules("ru")

const copy = {
  t: (key: string, params?: Record<string, string | number | boolean>) =>
    (messages.find(([name]) => name === key)?.[1] ?? key).replace(/{{(\w+)}}/g, (_, name: string) =>
      String(params?.[name] ?? ""),
    ),
  plural: (key: string, count: number) => copy.t(`${key}.${rules.select(count)}`, { count }),
}

const settled = { v: 1, state: "settled", status: "SUCCEEDED" }

test.each([
  { facts: { kind: "import", sourceName: "sales-demo.csv" }, title: "Прочитал таблицу «sales-demo.csv»" },
  { facts: { kind: "build", nodeCount: 4 }, title: "Собрал сценарий из 4 узлов" },
  { facts: { kind: "build", nodeCount: 21 }, title: "Собрал сценарий из 21 узла" },
  {
    facts: { kind: "save", package: { name: "ABC-анализ.lgp", directory: "/user" } },
    title: "Сохранил «ABC-анализ.lgp» в /user",
  },
  { facts: { kind: "unrecognized" }, title: "Выполнил шаг в Loginom" },
])("formats $title from the receipt", ({ facts, title }) => {
  expect(loginomStepPhrase(copy, decodeFacts({ ...settled, ...facts }))).toBe(title)
})

test("uses the same phrase inline and preserves the filename's case", () => {
  const facts = decodeFacts({ ...settled, kind: "import", sourceName: "Sales.csv" })
  expect(loginomStepPhrase(copy, facts, { lowercase: true })).toBe("прочитал таблицу «Sales.csv»")
})

test("uses the C3.1 node and port facts to identify an import with a read result", () => {
  const facts = decodeFacts({
    ...settled,
    operationId: "import",
    kind: "execute",
    node: { guid: "node", type: "imports.text", label: "CSV import node" },
    ports: [{ guid: "output", index: 0, rowCount: 2400, columnCount: 6 }],
  })

  expect(loginomStepPhrase(copy, facts)).toBe("Прочитал таблицу")
})

test("falls back for an older receipt and distinguishes pending work", () => {
  expect(loginomStepPhrase(copy, decodeFacts(undefined))).toBe("Выполнил шаг в Loginom")
  expect(loginomStepPhrase(copy, decodeFacts({ v: 1, state: "running", kind: "build", nodeCount: 4 }))).toBe(
    "Получил промежуточный результат Loginom",
  )
})

test("only shows a retry limit and timeout duration when the failure receipt provides them", () => {
  const failure = { v: 1, state: "settled", status: "FAILED", kind: "build", attempt: 1 }
  expect(
    failureTitle(
      copy,
      Option.getOrUndefined(
        decodeFacts({
          ...failure,
          maxAttempts: 2,
          error: { message: "Internal error", timeoutMs: 30_000 },
        }),
      ),
    ),
  ).toBe("Не удалось собрать сценарий в Loginom · Loginom не ответил за 30 с · попытка 1 из 2")
  expect(failureTitle(copy, Option.getOrUndefined(decodeFacts(failure)))).toBe(
    "Не удалось собрать сценарий в Loginom · попытка 1",
  )
})
