export const salesFile = "sales-demo.csv"

export const salesCsv =
  [
    "year;amount",
    "2026;1",
    "2026;2",
    "2026;3",
    "2026;4",
    "2026;5",
    "2026;6",
    "2026;7",
    "2026;8",
    "2025;9",
    "2025;10",
    "2025;11",
    "2025;12",
  ].join("\n") + "\n"

export const gatePrompts = {
  read: "Прочитай пакет Продажи.lgp.",
  reread: "Проверь ещё раз, доступен ли пакет Продажи.lgp.",
  write: "Сохрани новую версию пакета Продажи.lgp.",
  check: "Проверь, какая версия Продажи.lgp сохранилась.",
  repeat: "Примени настройку фильтра в пакете Продажи.lgp.",
  closed: "Ответь, доступна ли модель организации.",
  import: "Импортируй учебную таблицу sales-demo.csv и запусти узел импорта.",
  filter: "Добавь фильтр за 2026 год и запусти его.",
  save: "Сохрани учебный пакет продаж в Loginom.",
}

const packagePath = "/gate/Продажи.lgp"
const workflow = { workflow_id: "gate-workflow" }
const doc = "gate-document"
const skill = { tool: "skill", input: { id: "loginom-automation" } }
const prepare = { prepared: true, document_id: doc, workflow_ref: workflow }
const read = { package_path: packagePath }
const save = { action_key: "package.save_checkpoint", document_id: doc, workflow_ref: workflow }

type DockCall = {
  name: string
  input: Record<string, unknown>
  receipt: Record<string, unknown>
  hold?: boolean
}

type Turn = {
  prompt: string
  reply: string
  automation?: boolean
  admitUpload?: boolean
  repeatStop?: boolean
  calls: DockCall[]
}

const inspect = (receipt: DockCall["receipt"], hold = false): DockCall => ({
  name: "dock_inspect",
  input: read,
  receipt,
  hold,
})
const checkpoint = (receipt: DockCall["receipt"]): DockCall => ({
  name: "dock_action_run",
  input: save,
  receipt,
})

const node = (type: string, operation_id: string, parameters: Record<string, unknown>, inputs: unknown[]) => ({
  operation_id,
  document_id: doc,
  workflow_ref: workflow,
  target: { kind: "new", type },
  parameters,
  inputs,
  finish: "execute",
})

const output = (operation_id: string, node_id: string, row_count: number) => ({
  operation_id,
  state: "settled",
  status: "SUCCEEDED",
  node: { document_id: doc, ...workflow, node_id },
  output: { ports: [{ port: "Output", port_guid: node_id + "-out", row_count }] },
})

const repeatedApply: DockCall = {
  name: "dock_node_apply",
  input: node("transform.filter_data", "gate-repeat", { year: 2026 }, []),
  receipt: output("gate-repeat", "filter", 8),
}

export type GateScenario = "7" | "8" | "9" | "10"

export const gateScenarios: Record<GateScenario, readonly Turn[]> = {
  "7": [],
  "8": [
    {
      prompt: gatePrompts.read,
      automation: true,
      calls: [
        { name: "dock_prepare", input: { intent: "open_package", ...read }, receipt: prepare },
        inspect(
          {
            operation_id: "gate-read",
            state: "settled",
            status: "FAILED",
            error: "Связь с Loginom прервалась при чтении.",
          },
          true,
        ),
      ],
      reply: "Шаг чтения не выполнен: Loginom недоступен.",
    },
    {
      prompt: gatePrompts.reread,
      automation: true,
      calls: [inspect({ state: "settled", status: "SUCCEEDED", package_ref: { path: packagePath }, revision: "v1" })],
      reply: "Loginom снова доступен. Прочитана версия v1 пакета Продажи.lgp.",
    },
    {
      prompt: gatePrompts.write,
      automation: true,
      calls: [
        checkpoint({
          operation_id: "gate-write",
          state: "settled",
          status: "AMBIGUOUS",
          error: "Ответ на запись потерян.",
          outcome: { status: "unknown" },
        }),
      ],
      reply: "Исход записи не подтверждён. Нужно проверить состояние пакета.",
    },
    {
      prompt: gatePrompts.check,
      automation: true,
      calls: [inspect({ state: "settled", status: "SUCCEEDED", package_ref: { path: packagePath }, revision: "v1" })],
      reply: "Проверка пакета подтвердила версию v1.",
    },
    {
      prompt: gatePrompts.repeat,
      automation: true,
      repeatStop: true,
      calls: [repeatedApply, repeatedApply],
      reply: "Третий вызов остановлен по вашему выбору.",
    },
  ],
  "9": [
    {
      prompt: gatePrompts.closed,
      calls: [],
      reply: "Отвечаю моделью организации.",
    },
  ],
  "10": [
    {
      prompt: gatePrompts.import,
      automation: true,
      admitUpload: true,
      calls: [
        { name: "dock_prepare", input: { intent: "new_workflow" }, receipt: prepare },
        {
          name: "dock_artifact_deliver",
          input: { artifact_id: "artifact-1", operation_id: "gate-upload", overwrite: "reject" },
          receipt: {
            state: "settled",
            status: "SUCCEEDED",
            output: { upload_operation_id: "gate-upload", destination: "/gate/sales-demo.csv", upload_status: "ready" },
          },
        },
        {
          name: "dock_node_apply",
          input: node("imports.text", "gate-import", { source: { upload_operation_id: "gate-upload" } }, []),
          receipt: output("gate-import", "import", 12),
        },
      ],
      reply: "Узел «Импорт текста» выполнен. Прочитано 12 строк.",
    },
    {
      prompt: gatePrompts.filter,
      automation: true,
      calls: [
        {
          name: "dock_node_apply",
          input: node("transform.filter_data", "gate-filter", { year: 2026 }, [
            { node_id: "import", port_id: "import-out" },
          ]),
          receipt: output("gate-filter", "filter", 8),
        },
      ],
      reply: "Узел «Фильтр строк» подключён к импорту и выполнен. За 2026 год осталось 8 строк.",
    },
    {
      prompt: gatePrompts.save,
      automation: true,
      calls: [
        checkpoint({
          state: "settled",
          status: "SUCCEEDED",
          operation_id: "gate-save",
          action_key: save.action_key,
          output: { package_ref: { path: packagePath }, save_completed: true, reopened: false },
        }),
      ],
      reply: `Пакет сохранён в Loginom по пути ${packagePath}.`,
    },
  ],
}

export function modelCalls(turn: Turn, uploadedPath: string | undefined) {
  const dock = turn.calls.map((call) => ({ tool: `loginom_${call.name}`, input: call.input }))
  if (turn.repeatStop) dock.push({ tool: "loginom_dock_node_apply", input: repeatedApply.input })
  if (turn.admitUpload) dock.splice(1, 0, { tool: "loginom_file_admit", input: { path: uploadedPath } })
  return turn.automation ? [skill, ...dock] : dock
}
