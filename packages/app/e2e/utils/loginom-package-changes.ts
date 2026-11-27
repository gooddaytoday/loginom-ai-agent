import type { JsonValue } from "@opencode/client/promise"
import type { Page } from "@playwright/test"
import { packageSchemaDiffFixture } from "./loginom-schema"
import { MockRpcError } from "./mock-api"
import {
  assistantID,
  assistantMessage,
  setupTimeline,
  sessionID,
  textPart,
  toolPart,
  userMessage,
  userText,
} from "./timeline"

const original = "/analyst/Продажи.lgp"

const copy = "/analyst/Копии агента/Продажи — правка агента.lgp"

const version = "/analyst/Продажи — v2.lgp"

const backup = "/analyst/Продажи — до правки.lgp"

const copyUrl = "https://loginom.example/agent-copy"

const schemaUrl = "https://loginom.example/agent-copy/schema"

const evidence = (executionId: string, rowCount: number) => ({
  run: { kind: "executed", scope: "workspace", executionId },
  table: { kind: "tableRead", executionId, rowCount },
})

function changeFacts() {
  const port = (guid: string, direction: "input" | "output", name: string, index = 0) => ({
    guid,
    direction,
    name,
    kind: "workflow",
    index,
  })

  const inputName = "Входной источник данных"
  const outputName = "Соответствуют условию"

  const importer = {
    guid: "import",
    label: "Импорт продаж",
    ports: [port("import-out", "output", "Выходной набор данных")],
    text_import: { file_or_url: "продажи.csv", column_separator: ";" },
  }

  const filter = {
    guid: "filter",
    label: "Фильтр по дате",
    ports: [port("filter-in", "input", inputName), port("filter-out", "output", outputName)],
  }

  const revenue = {
    guid: "revenue",
    label: "Выручка по регионам",
    ports: [port("revenue-in", "input", inputName)],
    grouping_fields: [
      { field: "Регион", role: "group", functions: null },
      { field: "Выручка", role: "measure", functions: "gdSum" },
    ],
  }

  const removed = {
    guid: "old",
    label: "Промежуточная выгрузка",
    ports: [port("old-in", "input", inputName)],
  }

  const added = {
    guid: "missing",
    label: "Проверка пустых значений",
    ports: [
      port("missing-in", "input", inputName),
      port("missing-out", "output", outputName),
      port("rejected-out", "output", "Не соответствуют условию", 1),
    ],
    filter_conditions: [{ field: "Цена", relation: "frtIsNotNull", join: "ctAnd", value: null }],
  }

  const toFilter = { source: importer.guid, output: "import-out", target: filter.guid, input: "filter-in" }
  const oldInput = { source: filter.guid, output: "filter-out", target: revenue.guid, input: "revenue-in" }
  const newInput = { ...oldInput, source: added.guid, output: "missing-out" }
  const toAdded = { ...oldInput, target: added.guid, input: "missing-in" }

  const snapshot = (nodes: JsonValue[], links: (typeof oldInput)[]): JsonValue => ({
    source: "saved",
    scope: "package",
    complete: true,
    workflows: [
      {
        nodes,
        links: links.map((link) => ({
          source: { node_guid: link.source, port_guid: link.output },
          target: { node_guid: link.target, port_guid: link.input },
        })),
        submodels: [],
      },
    ],
  })

  return {
    edits: [
      { kind: "node_added", node: { guid: added.guid, label: added.label } },
      { kind: "node_removed", node: { guid: removed.guid, label: removed.label } },
      { kind: "link_removed", link: oldInput, sourceLabel: filter.label, targetLabel: revenue.label },
      { kind: "link_added", link: toAdded, sourceLabel: filter.label, targetLabel: added.label },
      { kind: "link_added", link: newInput, sourceLabel: added.label, targetLabel: revenue.label },
    ],
    schemas: {
      before: snapshot([importer, filter, revenue, removed], [toFilter, oldInput]),
      after: snapshot(
        [{ ...importer, text_import: { ...importer.text_import, column_separator: "," } }, filter, added, revenue],
        [toFilter, toAdded, newInput],
      ),
    },
  } satisfies Record<string, JsonValue>
}

export async function setupPackageChanges(
  page: Page,
  options: {
    width?: number
    busy?: boolean
    stale?: boolean
    schema?: boolean
    facts?: boolean
    diagram?: boolean
  } = {},
) {
  const calls: { method: string; input: unknown }[] = []
  const oldLink = { source: "import", output: "old", target: "filter", input: "in" }

  const edits: JsonValue[] = [
    { kind: "node_added", node: { guid: "missing", label: "Проверка пустых значений" } },
    { kind: "node_removed", node: { guid: "old", label: "Промежуточная выгрузка" } },
    {
      kind: "node_moved",
      guid: "filter",
      label: "Фильтр по дате",
      from: { x: 300, y: 50 },
      to: { x: 75, y: 50 },
    },
    { kind: "node_renamed", guid: "summary", from: "Группировка", to: "Итоги продаж" },
    { kind: "link_removed", link: oldLink, sourceLabel: "Импорт продаж", targetLabel: "Фильтр по дате" },
    {
      kind: "link_added",
      link: { ...oldLink, output: "new" },
      sourceLabel: "Импорт продаж",
      targetLabel: "Фильтр по дате",
    },
  ]

  const changes = {
    v: 1,
    sessionID,
    turnID: assistantID,
    packageName: "Продажи.lgp",
    copyPath: copy,
    copyUrl,
    comparison: { original: evidence("original-run", 120), copy: evidence("copy-run", 120) },
    edits,
  } satisfies Record<string, JsonValue>

  if (options.facts) Object.assign(changes, changeFacts())

  if (options.diagram) Object.assign(changes, { edits: [], schemas: packageSchemaDiffFixture() })

  if (options.schema) Object.assign(changes, { schemaUrl })
  const metadata = { loginom: { packageChanges: changes } }

  const messages = [
    userMessage([userText("Внеси улучшения в сценарий продаж.")]),
    assistantMessage([
      textPart("prt_loginom_final", "Внёс изменения в копию пакета."),
      toolPart(
        "prt_loginom_package_changes",
        "loginom_package_changes",
        "completed",
        {},
        {
          output: "",
          metadata,
        },
      ),
    ]),
    ...(options.stale ? [userMessage(undefined, { id: "msg_loginom_new_user", created: 1700000005000 })] : []),
  ]

  await page.context().route("https://loginom.example/**", (route) => route.fulfill({ body: "Пакет Loginom" }))
  await setupTimeline(page, {
    locale: "ru",
    viewport: { width: options.width ?? 1280, height: options.diagram ? (options.width === 390 ? 844 : 1024) : 900 },
    messages,
    rpc({ id, method, input }) {
      if (id !== "loginom.package-copy") return
      calls.push({ method, input })

      if (method === "replace-original" && options.busy)
        return new MockRpcError({
          type: "loginom.package-copy.failed",
          message: "Package busy",
          data: { code: "PACKAGE_BUSY" },
        })

      if (method === "save-version") return { output: { path: version, name: "Продажи — v2.lgp" } }

      if (method === "replace-original") return { output: { path: original, backupPath: backup } }

      if (method === "restore-previous") return { output: { path: original } }

      if (method === "undo-save" || method === "discard") return { output: {} }
    },
  })

  return {
    card: page.getByRole("region", { name: "Изменения пакета" }),
    calls,
    sessionID,
    version,
    backup,
    copyUrl,
    schemaUrl,
  }
}
