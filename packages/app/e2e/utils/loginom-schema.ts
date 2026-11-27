import type { Page } from "@playwright/test"
import type { SessionMessageInfo } from "@opencode/client/promise"
import { pageMessagesFrom, T0 } from "./app"
import { openSession } from "./workspace"

const id = (number: number) => `fca4ee21-7521-4b4b-b99f-${number.toString().padStart(12, "0")}`

const port = (number: number, direction: "input" | "output", index: number, name: string) => ({
  guid: id(number),
  direction,
  index,
  kind: "workflow",
  name,
})

const point = (x: number, y: number) => ({ x, y })

const end = (node: number, port: number) => ({ node_guid: id(node), port_guid: id(port) })

const link = (from: number, output: number, to: number, input: number) => ({
  source: end(from, output),
  target: end(to, input),
})

const root = {
  label: "Сценарий продаж",
  key: [id(2)],
  nodes: [
    {
      guid: id(5),
      label: "Итоги по регионам",
      type: "TBGGroupDataEngine",
      position: point(540, 70),
      ports: [port(50, "input", 0, "Входной источник данных"), port(51, "output", 0, "Набор данных")],
      grouping_fields: [
        { field: "Регион", role: "group", functions: null },
        { field: "Выручка", role: "measure", functions: "gdSum" },
      ],
    },
    {
      guid: id(3),
      label: "CSV продаж",
      type: "TBGImportTextFile",
      position: point(70, 110),
      ports: [
        { ...port(32, "input", 0, "Подключение"), guid: "78ce58f4-e818-3754-bc2e-6af868677420" },
        { ...port(33, "input", 1, "Управляющие переменные"), guid: "455b65c3-0587-3a9c-b47e-9b0d285bff3c" },
        port(30, "output", 0, "Набор данных"),
      ],
      text_import: { file_or_url: "sales.csv", column_separator: ";" },
    },
    {
      guid: id(4),
      label: "Фильтр продаж",
      type: "TBGFilterDataEngine",
      position: point(305, 110),
      ports: [
        port(40, "input", 0, "Входной источник данных"),
        port(41, "output", 0, "Соответствуют условию"),
        port(42, "output", 1, "Не соответствуют условию"),
      ],
      filter_conditions: [{ field: "Выручка", relation: "frtGreater", value: "0", join: "ctAnd" }],
    },
    {
      guid: id(6),
      label: "Контроль качества",
      type: "TBGModelGenericComponentEngine",
      position: point(775, 70),
      ports: [port(60, "input", 0, "Продажи"), port(61, "output", 0, "Проверенные продажи")],
    },
    { guid: id(7), label: "Без координат", type: "TBGImportTextFile", position: null, ports: [] },
  ],
  links: [link(3, 30, 4, 40), link(4, 41, 5, 50), link(5, 51, 6, 60)],
  submodels: [
    {
      key: [id(2), id(6)],
      label: "Контроль качества",
      nodes: [
        {
          guid: id(8),
          label: "Внутренняя проверка",
          type: "TBGFilterDataEngine",
          position: point(140, 100),
          ports: [port(80, "input", 0, "Входной источник данных"), port(81, "output", 0, "Соответствуют условию")],
        },
      ],
      links: [link(6, 60, 8, 80), link(8, 81, 6, 61)],
      submodels: [],
    },
  ],
}

const saved = {
  source: "saved",
  scope: "package",
  complete: true,
  observed_at: new Date(T0).toISOString(),
  package: { name: "Продажи.lgp", guid: id(1) },
  workflows: [root],
}

const windowSnapshot = {
  source: "window",
  scope: "active_workflow",
  complete: false,
  limitations: ["active_workflow_only", "no_submodels", "no_node_settings"],
  observed_at: new Date(T0).toISOString(),
  package: { name: "Пакет из окна Loginom" },
  workflow: {
    document_id: "doc",
    workflow_id: "workflow",
    navigation_path: ["Модуль", "Сценарий"],
    nodes: [
      {
        guid: id(6),
        label: "Контроль качества",
        type: "control.supernode",
        position: point(0, 0),
        ports: [],
      },
    ],
    links: [],
  },
}

export const packageFinding = "Проверьте, куда попадают строки без выручки."

export function openLoginomSchemaConversation(page: Page, source: "saved" | "window") {
  const sessionID = "ses_schema"
  const finding = { text: packageFinding, package_guid: id(1), node_guids: [id(4), id(5)] }

  const messages: SessionMessageInfo[] = [
    { id: "msg_schema_user", type: "user", time: { created: T0 }, text: "Проверь сценарий продаж" },
    {
      id: "msg_schema_assistant",
      type: "assistant",
      time: { created: T0 + 1, completed: T0 + 2 },
      model: { id: "schema-fixture", providerID: "test" },
      agent: "build",
      cost: 0,
      tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
      finish: "stop",
      content: [
        { type: "text", text: ["\x60\x60\x60loginom-finding", JSON.stringify(finding), "\x60\x60\x60"].join("\n") },
      ],
    },
  ]

  return openSession(page, {
    name: "Schema",
    sessions: [{ id: sessionID, title: "Продажи" }],
    seed: { locale: "ru" },
    pageMessages: pageMessagesFrom({ [sessionID]: source === "saved" ? messages : messages.slice(0, 1) }),
    rpc: (params, payload) => {
      if (params.rpcID !== "loginom.package" || params.method !== "schema") return
      const requested = JSON.stringify(payload)

      if (requested === JSON.stringify({ input: { sessionID, source: "saved" } }))
        return { output: { snapshot: saved } }

      if (requested === JSON.stringify({ input: { sessionID } })) {
        return { output: { snapshot: source === "window" ? windowSnapshot : saved } }
      }

      return { output: { snapshot: null } }
    },
  })
}
