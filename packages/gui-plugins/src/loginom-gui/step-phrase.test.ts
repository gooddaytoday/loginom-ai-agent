import { expect, test } from "bun:test"
import { dict } from "./i18n/ru"
import { decodeFacts, failureTitle, loginomStepPhrase } from "./step-phrase"
import { Option } from "effect"

const messages = Object.entries(dict)

const copy = {
  t: (key: string, params?: Record<string, string | number | boolean>) =>
    (messages.find(([name]) => name === key)?.[1] ?? key).replace(/{{(\w+)}}/g, (_, name: string) =>
      String(params?.[name] ?? ""),
    ),
}

const settled = { v: 1, operationId: "test-operation", state: "settled", status: "SUCCEEDED" }

test.each([
  {
    facts: { kind: "save", evidence: [{ kind: "saved", path: "/user/ABC-анализ.lgp" }] },
    title: "Сохранил «ABC-анализ.lgp» в /user",
  },
  { facts: { kind: "unrecognized" }, title: "Выполнил шаг в Loginom" },
])("formats $title from the receipt", ({ facts, title }) => {
  expect(loginomStepPhrase(copy, decodeFacts({ ...settled, ...facts }))).toBe(title)
})

test("uses the same phrase inline and preserves the filename's case", () => {
  const facts = decodeFacts({
    ...settled,
    kind: "export",
    files: [{ artifactId: "sales", name: "Sales.csv", bytes: 1024 }],
  })
  expect(loginomStepPhrase(copy, facts, { lowercase: true })).toBe("выгрузил «Sales.csv»")
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
  expect(
    loginomStepPhrase(copy, decodeFacts({ v: 1, operationId: "execute", state: "running", kind: "execute" })),
  ).toBe("Получил промежуточный результат Loginom")
})

test("shows the producer’s failure message and attempt", () => {
  const facts = decodeFacts({
    ...settled,
    status: "FAILED",
    kind: "execute",
    attempt: 1,
    error: { code: "NODE_EXECUTION_FAILED", message: "Internal error", source: "loginom" },
  })

  expect(failureTitle(copy, Option.getOrUndefined(facts))).toBe(
    "Не удалось выполнить узел в Loginom · Internal error · попытка 1",
  )
})
