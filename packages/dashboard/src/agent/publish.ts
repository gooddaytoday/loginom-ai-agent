import { createHash } from "node:crypto"
import { readFile, realpath } from "node:fs/promises"
import { join } from "node:path"
import { Option, Schema } from "effect"
import { parsePublication, PublicationVersion, PublicationWrite } from "../contract/publication.ts"
import { buildDashboard, sourceFiles } from "./build.ts"
import { NO_SAMPLE } from "./draft.ts"
import { readDashboardSnapshot, type ControlBinding } from "./folder.ts"
import type { DashboardResources } from "./resources.ts"

export { embeddedValues, outputText } from "./build.ts"

type Prepared = { publication: { content: string; sourceHash: string }; control: ControlBinding; build: { hash: string; dir: string } }

export async function preparePublish(input: { work: string; operation: string; resources: DashboardResources; signal?: AbortSignal }):
  Promise<({ ok: true } & Prepared) | { ok: false; text: string }> {
  const work = await realpath(input.work)
  const saved = readDashboardSnapshot(work)
  if (!saved) return { ok: false, text: NO_SAMPLE }
  const build = await buildDashboard({
    work, node: input.resources.node, template: input.resources.template, out: join(work, "../control/draft"),
    publication: { operation: input.operation, sample: saved.sample }, signal: input.signal,
  })
  if (!build.ok) return { ok: false, text: "Сборка не удалась.\n" + build.output }
  const captured = await sourceFiles(input.operation)
  if ("error" in captured) return { ok: false, text: captured.error }
  const content = JSON.stringify({
    format: 1, template: 1, binding: saved.control.binding, title: saved.control.nodeName,
    parameters: saved.snapshot.parameters.map(parameter => ({ name: parameter.name, label: parameter.name })),
    files: await Promise.all(captured.files.map(async path => {
      const bytes = await readFile(join(input.operation, path))
      const binary = /\.(png|jpg|webp|woff2)$/i.test(path)
      return { path, encoding: binary ? "base64" : "utf8", content: binary ? bytes.toString("base64") : new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes) }
    })),
  })
  try {
    parsePublication(content)
  } catch (error) {
    return { ok: false, text: error instanceof Error && error.message === "DASHBOARD_PUBLICATION_TOO_LARGE"
      ? "Файл публикации вместе с метаданными и base64 превышает 1 МБ. Уменьшите исходники."
      : "Файл публикации не соответствует формату dashboard v1." }
  }
  return { ok: true, control: saved.control, publication: { content, sourceHash: createHash("sha256").update(content).digest("hex") }, build: { hash: build.hash, dir: build.dir } }
}

export async function finishPublish(input: Prepared & {
  work: string
  signal?: AbortSignal
  expected: PublicationVersion | null
  publish: (request: { origin: string; binding: ControlBinding["binding"]; content: string; expected: PublicationVersion | null }, signal?: AbortSignal) => Promise<PublicationWrite>
}) {
  input.signal?.throwIfAborted()
  const result = Schema.decodeUnknownOption(PublicationWrite, { onExcessProperty: "error" })(await input.publish({
    origin: input.control.origin, binding: input.control.binding, content: input.publication.content, expected: input.expected,
  }, input.signal))
  if (Option.isNone(result)) throw Error("DASHBOARD_WRITE_UNKNOWN")
  if (result.value.status === "changed") return {
    status: "needs-confirmation" as const, text: "Версия на стенде изменилась. Публикация не начата; подтвердите локальный черновик заново.",
  }
  if (result.value.version.sourceHash !== input.publication.sourceHash) throw Error("DASHBOARD_WRITE_UNKNOWN")
  return {
    status: "pending" as const, version: result.value.version,
    text: "Исходники переданы в Loginom. Готовность сборки на стенде ещё не подтверждена.",
  }
}
