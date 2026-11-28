import { documentName, type Format } from "@loginom-ai-agent/loginom-host/runner-rpc"
import type { OpenCodeClient } from "@opencode/client/promise"
import { Match, Option, Schema } from "effect"

export const formats: readonly Format[] = ["pdf", "docx", "md"]

export type Content = "brief" | "detailed" | "custom"

export type Outcome = "ready" | "unconfirmed" | "unknown" | "failed" | "stopped"

export type Run = {
  server: string
  sessionID: string
  directory: string
  filename: string
  formats: readonly Format[]
}

export type ChatAction = Pick<Run, "server" | "sessionID"> &
  ({ kind: "preview"; file: string } | { kind: "discuss"; files: string[] })

type History = Awaited<ReturnType<OpenCodeClient["session"]["context"]>>

const receipt = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Struct({ output: Schema.String })))

export function historyResult(run: Run, history: History) {
  const tools = history.flatMap((message) =>
    message.type === "assistant" ? message.content.filter((part) => part.type === "tool") : [],
  )

  const generator = tools.filter((tool) => tool.name === "package_docs_run")
  const files = new Map<Format, string>()
  const directory = run.directory.replaceAll("\\", "/")

  for (const { executed, state } of generator) {
    if (executed === false || state.status !== "completed" || state.input.operation !== "emit") continue

    const format = run.formats.find(
      (format) => format === state.input.format || (format === "pdf" && state.input.format === undefined),
    )

    if (!format) continue

    for (const item of state.content) {
      if (item.type !== "text") continue
      const result = Option.getOrUndefined(receipt(item.text))

      if (!result) continue
      const path = result.output.replaceAll("\\", "/")

      if (path === `${directory}/${documentName(run.filename, format)}`) files.set(format, result.output)
    }
  }

  const idle = history.at(-1)

  const outcome: Outcome =
    idle?.type !== "idle"
      ? "unknown"
      : idle.outcome === "interrupted"
        ? "stopped"
        : idle.outcome === "succeeded" && files.size === run.formats.length
          ? "ready"
          : idle.outcome === "failed" && !tools.length
            ? "failed"
            : "unconfirmed"

  const stage = generator.some(
    ({ state }) => state.status !== "streaming" && "input" in state && state.input.operation === "emit",
  )
    ? 3
    : generator.some(({ state }) => state.status === "completed")
      ? 2
      : 1

  return { files, outcome, stage }
}

export function documentationPrompt(
  filename: string,
  selected: readonly Format[],
  content: Content,
  description: string,
) {
  const detail = Match.value(content).pipe(
    Match.when("custom", () => `Следуй описанию пользователя вместо стандартной структуры:\n${description}`),
    Match.when("brief", () => "Кратко опиши назначение пакета, ключевые узлы и поток данных."),
    Match.when("detailed", () => "Подробно опиши назначение пакета, узлы, настройки, входы, выходы и потоки данных."),
    Match.exhaustive,
  )

  const draft =
    content === "custom"
      ? "Вызови package_docs_run с этим .lgp и operation=extract. По данным structure.json создай свой report.md в той же папке."
      : "Вызови package_docs_run с этим .lgp и operation=skeleton, заполни созданный report.md по данным structure.json и инструкции генератора."

  return `Документируй локальную копию ${JSON.stringify(filename)} на русском языке. ${detail}
${draft}
Затем вызови package_docs_run с operation=emit отдельно для каждого из форматов: ${selected.join(", ")}.
Не изменяй пакет. В ответе перечисли созданные документы или явно сообщи, какие не удалось создать.`
}
