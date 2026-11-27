import type { Page } from "@playwright/test"
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

export async function setupPackageChanges(
  page: Page,
  options: { width?: number; busy?: boolean; stale?: boolean; schema?: boolean } = {},
) {
  const calls: { method: string; input: unknown }[] = []
  const oldLink = { source: "import", output: "old", target: "filter", input: "in" }
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
          metadata: {
            loginom: {
              packageChanges: {
                v: 1,
                sessionID,
                turnID: assistantID,
                packageName: "Продажи.lgp",
                copyPath: copy,
                copyUrl,
                ...(options.schema ? { schemaUrl } : {}),
                edits: [
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
                ],
                comparison: { original: evidence("original-run", 120), copy: evidence("copy-run", 120) },
              },
            },
          },
        },
      ),
    ]),
    ...(options.stale ? [userMessage(undefined, { id: "msg_loginom_new_user", created: 1700000005000 })] : []),
  ]

  await page.context().route("https://loginom.example/**", (route) => route.fulfill({ body: "Пакет Loginom" }))
  await setupTimeline(page, {
    locale: "ru",
    viewport: { width: options.width ?? 1280, height: 900 },
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
