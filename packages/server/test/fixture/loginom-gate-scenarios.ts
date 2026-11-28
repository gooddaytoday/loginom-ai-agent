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
  queue: "Укажи путь пакета.",
  outage: "Прочитай настройки узлов пакета «Продажи.lgp».",
  write: "Сохрани новую версию пакета Продажи.lgp.",
  check: "Проверь, сохранился ли пакет Продажи.lgp.",
  repeat: "Примени настройку фильтра в пакете Продажи.lgp.",
  closed: "Ответь, доступна ли модель организации.",
  import: "Импортируй учебную таблицу sales-demo.csv, подключи «Импорт» к узлу «Результат» и запусти «Результат».",
  filter: "Вставь фильтр перед «Результат»: только 2026 год.",
  save: "Сохрани учебный пакет продаж в Loginom.",
}

export const packagePath = "/gate/Продажи.lgp"
export const uploadPath = `/gate/${salesFile}`
export const uploadGrant = "gate-upload-grant"
export const uploadOperation = "gate-delivery:upload"
export const workflow = { workflow_id: "gate-workflow" }
export const workflowRef = {
  ...workflow,
  tab_tid: "MF;cntMain;cntWorkspace;Workspace;t.br;tb-1",
  prefix: "MF;TF-1",
  navigation_path: [{ tid: "scenario", label: "Сценарий" }],
}
export const doc = "gate-document"
export const nodeRef = (node_id: string) => ({ document_id: doc, ...workflow, node_id })
export const originalEdge = { source: "import", output: 0, target: "result", input: 0 }
export const replacementEdge = { source: "filter", output: 0, target: "result", input: 0 }
const skill = { tool: "skill", input: { id: "loginom-automation" } }
const resultNode = "transform.sorting"
const filterNode = "transform.filter_data"
const conditions = {
  groups: [[{ field: { kind: "input_field", name: "year" }, type: "integer", operator: "=", value: 2026 }]],
}
const fromImport = { source: nodeRef("import"), output: 0, input: 0 }
const fromFilter = { source: nodeRef("filter"), output: 0, input: 0 }

type DockCall = {
  name: string
  input: Record<string, unknown>
  expected: Record<string, unknown>
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

const prepare = (intent: "open_package" | "new_draft"): DockCall => ({
  name: "dock_prepare",
  input: { intent, operation_id: "gate-prepare", ...(intent === "open_package" ? { package_path: packagePath } : {}) },
  expected: { prepared: true, workspace: { document_id: doc, workflow_ref: workflowRef } },
})
const describe = (type: string, mode: string): DockCall => ({
  name: "dock_action_describe",
  input: { node_types: [type], modes: [mode] },
  expected: { node_types: [{ type, modes: [mode] }] },
})
const observe = (expected: DockCall["expected"], hold = false): DockCall => ({
  name: "dock_workspace_observe",
  input: { scope: "graph" },
  expected,
  hold,
})
const checkpoint = (
  operation_id: string,
  conflict_policy: "fail" | "replace",
  expected: DockCall["expected"],
): DockCall => ({
  name: "dock_action_run",
  input: { action_key: "package.save_checkpoint", operation_id, parameters: { path: packagePath, conflict_policy } },
  expected,
})

const node = (operation_id: string, target: object, mode: string, parameters: object, inputs: object[]) => ({
  operation_id,
  contract_revision: "1.0.0",
  document_id: doc,
  workflow_ref: workflow,
  target,
  mode,
  parameters,
  inputs,
  finish: "execute",
  read: { ports: [0], sample_rows: 0 },
})
const apply = (input: ReturnType<typeof node>, state?: "running"): DockCall => ({
  name: "dock_node_apply",
  input,
  expected: { operation_id: input.operation_id, ...(state ? { state } : {}) },
})
const runNode = (input: ReturnType<typeof node>, id: string, row_count: number, replaced = false): DockCall[] => [
  apply(input, "running"),
  {
    name: "dock_node_wait",
    input: { operation_id: input.operation_id, timeout_ms: 1000 },
    expected: {
      state: "settled",
      status: "SUCCEEDED",
      operation_id: input.operation_id,
      node: nodeRef(id),
      output: { ports: [{ port: 0, fresh: true, row_count }] },
      ...(replaced ? { replaced_links: [{ removed: originalEdge, created: replacementEdge }] } : {}),
    },
  },
]
const repeatApply = apply(
  node("gate-repeat", { kind: "existing", type: filterNode, ref: nodeRef("filter") }, "conditions", conditions, []),
)
const outage = observe({ status: "FAILED", action_key: "workspace.observe" })
const saved = { package_ref: { path: packagePath }, save_completed: true }

export type GateScenario = "7" | "8" | "9" | "10"

export const gateScenarios: Record<GateScenario, readonly Turn[]> = {
  "7": [],
  "8": [
    {
      prompt: gatePrompts.read,
      automation: true,
      calls: [
        prepare("open_package"),
        observe(
          {
            status: "SUCCEEDED",
            action_key: "workspace.observe",
            output: { package_identity: { path: packagePath }, nodes: [{ node_id: "filter", label_text: "Фильтр" }] },
          },
          true,
        ),
      ],
      reply: "В пакете Продажи.lgp найден узел «Фильтр».",
    },
    { prompt: gatePrompts.queue, calls: [], reply: "Путь пакета — /gate/Продажи.lgp." },
    {
      prompt: gatePrompts.write,
      automation: true,
      calls: [
        checkpoint("gate-write", "replace", {
          status: "AMBIGUOUS",
          operation_id: "gate-write",
          effect_possible: true,
        }),
      ],
      reply: "Исход записи не подтверждён. Нужно проверить состояние пакета.",
    },
    {
      prompt: gatePrompts.check,
      automation: true,
      calls: [
        {
          name: "dock_operation_inspect",
          input: { operation_id: "gate-write" },
          expected: {
            status: "SUCCEEDED",
            action_key: "operation.inspect",
            output: {
              operation_id: "gate-write",
              state: "resolved",
              effect_state: "verified",
              cleanup_confirmed: true,
              outcome: { status: "SUCCEEDED", action_key: "package.save_checkpoint", output: saved },
            },
          },
        },
      ],
      reply: "Проверка подтвердила сохранение пакета Продажи.lgp.",
    },
    {
      prompt: gatePrompts.repeat,
      automation: true,
      repeatStop: true,
      calls: [describe(filterNode, "conditions"), repeatApply, repeatApply],
      reply: "Третий вызов остановлен по вашему выбору.",
    },
    {
      prompt: gatePrompts.outage,
      automation: true,
      automaticReadRetry: true,
      calls: [outage, outage],
      reply: "Чтение завершилось ошибкой.",
    },
  ],
  "9": [{ prompt: gatePrompts.closed, calls: [], reply: "Отвечаю моделью организации." }],
  "10": [
    {
      prompt: gatePrompts.import,
      automation: true,
      admitUpload: true,
      calls: [
        prepare("new_draft"),
        {
          name: "dock_artifact_deliver",
          input: {
            artifact_id: "artifact-1",
            operation_id: "gate-delivery",
            upload_grant_id: uploadGrant,
            budget_ms: 120000,
          },
          expected: {
            state: "settled",
            status: "SUCCEEDED",
            upload_status: "ready",
            output: {
              upload_operation_id: uploadOperation,
              destination: uploadPath,
              upload_completion_verified: true,
            },
          },
        },
        describe("imports.text", "delimited"),
        ...runNode(
          node(
            "gate-import",
            { kind: "new", type: "imports.text", label: "Импорт" },
            "delimited",
            {
              source: { kind: "verified_delivery", artifact_id: "artifact-1", upload_operation_id: uploadOperation },
              settings: {
                format: { delimiter: ";" },
                columns: [
                  { name: "year", type: "integer" },
                  { name: "amount", type: "integer" },
                ],
              },
            },
            [],
          ),
          "import",
          12,
        ),
        describe(resultNode, "keys"),
        ...runNode(
          node(
            "gate-result-initial",
            { kind: "new", type: resultNode, label: "Результат" },
            "keys",
            {
              keys: [{ field: { kind: "input_field", name: "amount" }, direction: "ASC" }],
            },
            [fromImport],
          ),
          "result",
          12,
        ),
      ],
      reply: "Узел «Импорт» подключён к узлу «Результат». В узле «Результат» 12 строк.",
    },
    {
      prompt: gatePrompts.filter,
      automation: true,
      calls: [
        describe(filterNode, "conditions"),
        ...runNode(
          node("gate-filter", { kind: "new", type: filterNode, label: "Фильтр" }, "conditions", conditions, [
            fromImport,
          ]),
          "filter",
          8,
        ),
        ...runNode(
          node("gate-result-relinked", { kind: "existing", type: resultNode, ref: nodeRef("result") }, "keys", {}, [
            { ...fromFilter, replace_existing: true },
          ]),
          "result",
          8,
          true,
        ),
      ],
      reply:
        "Связь «Импорт → Результат» заменена на «Импорт → Фильтр → Результат». В узле «Результат» 8 строк за 2026 год.",
    },
    {
      prompt: gatePrompts.save,
      automation: true,
      calls: [checkpoint("gate-save", "fail", { status: "SUCCEEDED", operation_id: "gate-save", output: saved })],
      reply: `Пакет сохранён в Loginom по пути ${packagePath}.`,
    },
  ],
}

export function modelCalls(turn: Turn, uploadedPath: string | undefined) {
  // Recovery belongs to the app/host. The recorded model asks for this read only once.
  const requested = turn.automaticReadRetry ? turn.calls.slice(0, 1) : turn.calls
  const dock = requested.map((call) => ({ tool: `loginom_${call.name}`, input: call.input }))
  if (turn.repeatStop) dock.push({ tool: "loginom_dock_node_apply", input: repeatApply.input })
  if (turn.admitUpload) dock.splice(1, 0, { tool: "loginom_file_admit", input: { path: uploadedPath } })
  return turn.automation ? [skill, ...dock] : dock
}
