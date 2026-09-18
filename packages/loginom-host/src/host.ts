import { inputStore, type InputFile } from "./inputs"
import { readFile, rm } from "node:fs/promises"
import { isAbsolute, join } from "node:path"
import { randomUUID } from "node:crypto"
import { supervise } from "./supervisor"
import { connectionService } from "./connection/connection-service"
import { connectionStore, type ActiveConnection } from "./connection/connection-store"
import type { CredentialCodec } from "./connection/credentials"
import { recoveryStore } from "./connection/recovery-store"

export async function createLoginomHost(options: {
  root: string
  resources: string
  codec: CredentialCodec
  environment?: NodeJS.ProcessEnv
  headless?: boolean
}) {
  if (![options.root, options.resources].every(isAbsolute)) throw new Error("LOGINOM_ABSOLUTE_PATH_REQUIRED")
  const root = options.root
  const resources = options.resources
  const environment = { ...(options.environment ?? process.env) }
  const inputs = inputStore(join(root, "inputs"))
  const journal = await recoveryStore(join(root, "recovery"))
  const generations = new Map<
    number,
    { connection: ActiveConnection; children: Map<string, Promise<Awaited<ReturnType<typeof supervise>>>> }
  >()
  async function launch(connection: ActiveConnection, chat: string, validation = false) {
    const manifest = JSON.parse(await readFile(join(resources, "resource-manifest.json"), "utf8"))
    return supervise({
      node: join(resources, "bin", process.platform === "win32" ? "node.exe" : "node"),
      entry: join(resources, "runtime/src/managed-entry.mjs"),
      resources,
      stateDir: join(root, validation ? "validation" : "runtime"),
      generation: connection.generation,
      chat,
      connection,
      validation,
      headless: validation || chat === "readiness" || options.headless === true,
      environment,
      endpoint: environment.LOGINOM_AI_AGENT_KNOWLEDGE_ENDPOINT ?? manifest.endpoint,
      actionManifestUri: manifest.actionManifestUri,
      actionManifestSha256: manifest.actionManifestSha256,
    })
  }
  const service = await connectionService(
    connectionStore(join(root, "connection"), options.codec),
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
          async reset() {
            const results = await Promise.allSettled(
              [...generation.children.entries()]
                .filter(([chat]) => chat !== "readiness")
                .map(async ([chat, child]) => {
                  await (await child).close()
                  generation.children.delete(chat)
                }),
            )
            if (results.some((result) => result.status === "rejected"))
              throw new Error("LOGINOM_RUNTIME_CLEANUP_FAILED")
          },
          async close() {
            generations.delete(connection.generation)
            const results = await Promise.allSettled(
              [...generation.children.values()].map(async (child) => (await child).close()),
            )
            if (results.some((result) => result.status === "rejected"))
              throw new Error("LOGINOM_RUNTIME_CLEANUP_FAILED")
          },
        }
      },
    },
    journal,
  )
  const recoveries = new Map<string, NonNullable<ReturnType<typeof service.acquire>>>()
  return {
    ...service,
    api: {
      ...service.api,
      async acknowledgeRecovery(input: Parameters<typeof service.api.acknowledgeRecovery>[0]) {
        const view = await service.api.acknowledgeRecovery(input)
        recoveries.clear()
        return view
      },
    },
    journal,
    recoveries,
    async interruptAll() {
      const results = await Promise.allSettled(
        [...generations.values()].flatMap((generation) =>
          [...generation.children.entries()]
            .filter(([chat]) => chat !== "readiness")
            .map(async ([, child]) => (await child).request("interrupt")),
        ),
      )
      if (results.some((result) => result.status === "rejected")) throw new Error("LOGINOM_RUNTIME_INTERRUPT_FAILED")
    },
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
