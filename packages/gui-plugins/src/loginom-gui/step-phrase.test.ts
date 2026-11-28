import { expect, test } from "bun:test"
import { Option } from "effect"
import { dict } from "./i18n/ru"
import { decodeFacts, failureReason, failureTitle, loginomStepPhrase } from "./step-phrase"

function russianCopy() {
  const messages = new Map(Object.entries(dict))

  const t = (key: string, params?: Record<string, string | number | boolean>) =>
    (messages.get(key) ?? key).replace(/{{(\w+)}}/g, (_, name: string) => String(params?.[name] ?? ""))

  return { t }
}

const settled = {
  v: 1,
  operationId: "operation",
  state: "settled",
  status: "SUCCEEDED",
}

const saved = {
  ...settled,
  kind: "save",
  evidence: [
    { kind: "saved", path: "/user/ABC-анализ.lgp" },
    { kind: "savedGraphRead", nodeCount: 4, scope: "activeWorkflow" },
  ],
}

test.each([
  {
    facts: {
      kind: "execute",
      node: { guid: "node", label: "Импорт CSV", type: "imports.text" },
      ports: [{ guid: "output", index: 0, rowCount: 2400, columnCount: 6 }],
    },
    title: "Прочитал таблицу",
  },
  {
    facts: {
      kind: "add",
      node: { guid: "node", label: "Фильтр", type: "transform.filter_data" },
    },
    title: "Добавил узел «Фильтр»",
  },
  { facts: saved, title: "Сохранил «ABC-анализ.lgp» в /user" },
  { facts: { kind: "build", nodeCount: 4 }, title: "Выполнил шаг в Loginom" },
])("formats $title from confirmed receipt fields", ({ facts, title }) => {
  expect(loginomStepPhrase(russianCopy(), decodeFacts({ ...settled, ...facts }))).toBe(title)
})

test("uses the same phrase inline and preserves the filename's case", () => {
  expect(loginomStepPhrase(russianCopy(), decodeFacts(saved), { lowercase: true })).toBe(
    "сохранил «ABC-анализ.lgp» в /user",
  )
})

test("falls back for an older receipt and distinguishes pending work", () => {
  expect(loginomStepPhrase(russianCopy(), decodeFacts(undefined))).toBe("Выполнил шаг в Loginom")
  expect(loginomStepPhrase(russianCopy(), decodeFacts({ ...settled, state: "running" }))).toBe(
    "Получил промежуточный результат Loginom",
  )
})

test("uses the confirmed error code and short reason without inferring a retry limit", () => {
  const facts = Option.getOrUndefined(
    decodeFacts({
      ...settled,
      kind: "execute",
      status: "FAILED",
      ports: "invalid legacy value",
      attempt: 1,
      error: {
        code: "NODE_EXECUTION_FAILED",
        message: 'Loginom не ответил\n{"private":"raw"}',
        source: "loginom",
      },
    }),
  )

  expect(failureTitle(russianCopy(), facts)).toBe(
    "Не удалось выполнить узел в Loginom · NODE_EXECUTION_FAILED — Loginom не ответил · попытка 1",
  )
  expect(failureReason(russianCopy(), undefined)).toBeUndefined()
})
