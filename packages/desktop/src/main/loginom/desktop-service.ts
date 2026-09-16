import { inputStore, type InputFile } from "@loginom-ai-agent/loginom-host/inputs"
import { app, safeStorage } from "electron"
import { readFile, rm } from "node:fs/promises"
import { join, resolve } from "node:path"
import { randomUUID } from "node:crypto"
import { supervise } from "@loginom-ai-agent/loginom-host/supervisor"
import { connectionService } from "./connection-service"
import { connectionStore, type ActiveConnection } from "./connection-store"
import { credentials } from "./credentials"

export async function desktopLoginom() {
  const resources = app.isPackaged
    ? join(process.resourcesPath, "loginom")
    : resolve(import.meta.dirname, "../../resources/loginom")
  const root = join(app.getPath("userData"), "loginom")
  const inputs = inputStore(join(root, "inputs"))
  const generations = new Map<
    number,
    { connection: ActiveConnection; children: Map<string, Promise<Awaited<ReturnType<typeof supervise>>>> }
  >()
  async function launch(connection: ActiveConnection, chat: string, validation = false) {
    const manifest = JSON.parse(await readFile(join(resources, "resource-manifest.json"), "utf8"))
    return supervise({
      node: join(resources, "bin/node"),
      entry: join(resources, "runtime/src/managed-entry.mjs"),
      resources,
      stateDir: join(root, validation ? "validation" : "runtime"),
      generation: connection.generation,
      chat,
      connection,
      validation,
      headless: validation || chat === "readiness",
      endpoint: process.env.LOGINOM_AI_AGENT_KNOWLEDGE_ENDPOINT ?? manifest.endpoint,
      actionManifestUri: manifest.actionManifestUri,
      actionManifestSha256: manifest.actionManifestSha256,
    })
  }
  const service = await connectionService(
    connectionStore(join(root, "connection"), credentials(process.platform, safeStorage)),
    {
      async check(connection) {
        const chat = randomUUID()
        try {
          const child = await launch(connection, chat, true)
          await child.close()
        } finally {
          await rm(join(root, "validation", "generations", String(connection.generation), "chats", chat), {
            recursive: true,
            force: true,
          })
        }
      },
      async prepare(connection) {
        const child = await launch(connection, "readiness")
        const generation = { connection, children: new Map([["readiness", Promise.resolve(child)]]) }
        generations.set(connection.generation, generation)
        return {
          async close() {
            generations.delete(connection.generation)
            await Promise.allSettled([...generation.children.values()].map(async (child) => (await child).close()))
          },
        }
      },
    },
  )
  return {
    ...service,
    recoveries: new Map<string, NonNullable<ReturnType<typeof service.acquire>>>(),
    async inputs(generation: number, chat: string, userMessage: string, files: InputFile[]) {
      const current = generations.get(generation)
      if (!current) throw new Error("LOGINOM_GENERATION_UNAVAILABLE")
      return inputs.admit(`${generation}:${chat}`, userMessage, files, `/${current.connection.username}`)
    },
    async runtime(generation: number, chat: string) {
      const current = generations.get(generation)
      if (!current) throw new Error("LOGINOM_GENERATION_UNAVAILABLE")
      const previous = current.children.get(chat)
      if (previous) return previous
      const child = launch(current.connection, chat)
      current.children.set(chat, child)
      child.catch(() => {
        if (current.children.get(chat) === child) current.children.delete(chat)
      })
      return child
    },
  }
}
