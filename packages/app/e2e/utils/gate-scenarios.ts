import type { Step } from "../../../cli/test/fixture/product-run"

export const gatePassword = "gate-fixture"
export const gateModelID = "test/test-model"
export const gateLoginom = {
  username: "first-user",
  password: "fixture-password",
  folder: "/first-user",
  documentationPath: "/first-user/Качество данных.lgp",
}
export const salesPackage = { path: "/first-user/Продажи.lgp", name: "Продажи", operationID: "gate-read-sales" }

export const gateScenarios = {
  first: {
    prompt: "Что такое пакет Loginom?",
    answer: "Пакет Loginom хранит сценарий обработки данных.",
    steps: [{ text: "Пакет Loginom хранит сценарий обработки данных." }],
  },
  documentation: {
    prompt: "Документируй «Качество данных.lgp» для коллеги в PDF и Word.",
    answer: "Описание пакета «Качество данных» подготовлено в PDF и Word.",
  },
  instructions: {
    prompt: `Открой пакет ${salesPackage.path} для проверки сценария продаж.`,
    answer: "Пакет «Продажи» открыт.",
    steps: [
      { tools: [{ name: "skill", input: { id: "loginom-automation" } }] },
      {
        tools: [
          {
            name: "loginom_dock_prepare",
            input: { intent: "open_package", package_path: salesPackage.path, operation_id: salesPackage.operationID },
          },
        ],
      },
      { text: "Пакет «Продажи» открыт." },
    ],
  },
} satisfies Record<string, { prompt: string; answer: string; steps?: Step[] }>

export const wizardDocumentation = {
  prompt: 'Документируй локальную копию "Качество данных.lgp" на русском языке.',
  answer: "Мастер сохранил описание пакета «Качество данных» в PDF и Word.",
  pdf: "Качество данных — описание.pdf",
  word: "Качество данных — описание.docx",
}

export type GateScenario = keyof typeof gateScenarios

export function gateMessageContents(request: unknown, role: "system" | "tool" | "user") {
  if (!request || typeof request !== "object" || !("messages" in request) || !Array.isArray(request.messages)) return []
  return request.messages.flatMap((message: unknown) => {
    if (!message || typeof message !== "object" || !("role" in message) || message.role !== role) return []
    if (!("content" in message)) return []
    if (typeof message.content === "string") return [message.content]
    if (!Array.isArray(message.content)) return []
    return message.content.flatMap((part: unknown) =>
      part &&
      typeof part === "object" &&
      "type" in part &&
      part.type === "text" &&
      "text" in part &&
      typeof part.text === "string"
        ? [part.text]
        : [],
    )
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
