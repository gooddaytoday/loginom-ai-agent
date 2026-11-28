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
  queue: "Укажи версию пакета.",
  outage: "Прочитай настройки узлов пакета «Продажи.lgp».",
  write: "Сохрани новую версию пакета Продажи.lgp.",
  check: "Проверь, какая версия Продажи.lgp сохранилась.",
  repeat: "Примени настройку фильтра в пакете Продажи.lgp.",
  closed: "Ответь, доступна ли модель организации.",
  import: "Импортируй учебную таблицу sales-demo.csv, подключи «Импорт» к узлу «Результат» и запусти «Результат».",
  filter: "Вставь фильтр перед «Результат»: только 2026 год.",
  save: "Сохрани учебный пакет продаж в Loginom.",
}

const packagePath = "/gate/Продажи.lgp"
export const workflow = { workflow_id: "gate-workflow" }
export const doc = "gate-document"
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
  automaticReadRetry?: boolean
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

export const output = (operation_id: string, node_id: string, row_count: number) => ({
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

export const nodeRef = (node_id: string) => ({ document_id: doc, ...workflow, node_id })
const fromImport = { source: nodeRef("import"), output: 0, input: 0 }
const fromFilter = { source: nodeRef("filter"), output: 0, input: 0 }
export const originalEdge = { source: "import", output: 0, target: "result", input: 0 }
export const replacementEdge = { source: "filter", output: 0, target: "result", input: 0 }
const resultNode = "transform.sorting"
const outageCall = (attempt: number): DockCall => ({
  name: "dock_inspect",
  input: { ...read, operation_id: "gate-outage" },
  receipt: {
    operation_id: "gate-outage",
    state: "settled",
    status: "FAILED",
    error: `Loginom недоступен. Попытка ${attempt}.`,
  },
})

export type GateScenario = "7" | "8" | "9" | "10"

export const gateScenarios: Record<GateScenario, readonly Turn[]> = {
  "7": [],
  "8": [
    {
      prompt: gatePrompts.read,
      automation: true,
      calls: [
        { name: "dock_prepare", input: { intent: "open_package", ...read }, receipt: prepare },
        inspect({ state: "settled", status: "SUCCEEDED", package_ref: { path: packagePath }, revision: "v1" }, true),
      ],
      reply: "Прочитана версия v1 пакета Продажи.lgp.",
    },
    {
      prompt: gatePrompts.queue,
      calls: [],
      reply: "Поправка учтена.",
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
    {
      prompt: gatePrompts.outage,
      automation: true,
      automaticReadRetry: true,
      calls: [outageCall(1), outageCall(2)],
      reply: "Чтение завершилось ошибкой.",
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
        {
          name: "dock_node_apply",
          input: {
            ...node(
              resultNode,
              "gate-result-initial",
              { keys: [{ field: { kind: "input_field", name: "amount" }, direction: "ASC" }] },
              [fromImport],
            ),
            target: { kind: "new", type: resultNode, label: "Результат" },
            mode: "keys",
          },
          receipt: output("gate-result-initial", "result", 12),
        },
      ],
      reply: "Узел «Импорт» подключён к узлу «Результат». В узле «Результат» 12 строк.",
    },
    {
      prompt: gatePrompts.filter,
      automation: true,
      calls: [
        {
          name: "dock_node_apply",
          input: {
            ...node(
              "transform.filter_data",
              "gate-filter",
              {
                groups: [
                  [{ field: { kind: "input_field", name: "year" }, type: "integer", operator: "=", value: 2026 }],
                ],
              },
              [fromImport],
            ),
            mode: "conditions",
          },
          receipt: output("gate-filter", "filter", 8),
        },
        {
          name: "dock_node_apply",
          input: {
            ...node(resultNode, "gate-result-relinked", {}, [{ ...fromFilter, replace_existing: true }]),
            target: { kind: "existing", type: resultNode, ref: nodeRef("result") },
            mode: "keys",
          },
          receipt: {
            ...output("gate-result-relinked", "result", 8),
            replaced_links: [{ removed: originalEdge, created: replacementEdge }],
          },
        },
      ],
      reply:
        "Связь «Импорт → Результат» заменена на «Импорт → Фильтр → Результат». В узле «Результат» 8 строк за 2026 год.",
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
  // Recovery belongs to the app/host. The recorded model asks for this read only once.
  const requested = turn.automaticReadRetry ? turn.calls.slice(0, 1) : turn.calls
  const dock = requested.map((call) => ({ tool: `loginom_${call.name}`, input: call.input }))
  if (turn.repeatStop) dock.push({ tool: "loginom_dock_node_apply", input: repeatedApply.input })
  if (turn.admitUpload) dock.splice(1, 0, { tool: "loginom_file_admit", input: { path: uploadedPath } })
  return turn.automation ? [skill, ...dock] : dock
}
