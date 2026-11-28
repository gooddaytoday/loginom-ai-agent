import type { Step } from "../../../cli/test/fixture/product-run"

export const gatePassword = "gate-fixture"
export const gateModelID = "test/test-model"
export const gateLoginom = { url: "https://loginom.example/app/", username: "analyst", folder: "/analyst" }

export const gateScenarios = {
  first: {
    prompt: "Что такое пакет Loginom?",
    answer: "Пакет Loginom хранит сценарий обработки данных.",
    steps: [{ text: "Пакет Loginom хранит сценарий обработки данных." }],
  },
  documentation: {
    prompt: "Документируй «Качество данных.lgp» для коллеги в PDF и Word.",
    answer: "Описание пакета «Качество данных» подготовлено в PDF и Word.",
    steps: [
      { tools: [{ name: "skill", input: { id: "package-docs" } }] },
      { tools: [{ name: "package_docs_run", input: { operation: "skeleton", lgp: "Качество данных.lgp" } }] },
      {
        tools: [{ name: "package_docs_run", input: { operation: "emit", lgp: "Качество данных.lgp", format: "pdf" } }],
      },
      {
        tools: [{ name: "package_docs_run", input: { operation: "emit", lgp: "Качество данных.lgp", format: "docx" } }],
      },
      { text: "Описание пакета «Качество данных» подготовлено в PDF и Word." },
    ],
  },
  instructions: {
    prompt: "Проверь сценарий продаж в пакете /user/Продажи.lgp.",
    answer: "Выручка. Перед расчётом нет проверки пустых значений.",
    steps: [
      { tools: [{ name: "skill", input: { id: "loginom-automation" } }] },
      {
        tools: [{ name: "loginom_dock_prepare", input: { intent: "open_package", package_path: "/user/Продажи.lgp" } }],
      },
      { text: "Выручка. Перед расчётом нет проверки пустых значений." },
    ],
  },
} satisfies Record<string, { prompt: string; answer: string; steps: Step[] }>

export type GateScenario = keyof typeof gateScenarios

export function gateMessageContents(request: unknown, role: "system" | "tool") {
  if (!request || typeof request !== "object" || !("messages" in request) || !Array.isArray(request.messages)) return []
  return request.messages.flatMap((message: unknown) => {
    if (!message || typeof message !== "object" || !("role" in message) || message.role !== role) return []
    return "content" in message && typeof message.content === "string" ? [message.content] : []
  })
}

export function gateToolReceipts(request: unknown) {
  return gateMessageContents(request, "tool").flatMap((content) => {
    try {
      const receipt: unknown = JSON.parse(content)
      return [receipt]
    } catch {
      return []
    }
  })
}
