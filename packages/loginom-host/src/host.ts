import { inputStore, type InputFile } from "./inputs"
import { readFile, rm } from "node:fs/promises"
import { isAbsolute, join } from "node:path"
import { randomUUID } from "node:crypto"
import { Schema } from "effect"
import { Loginom } from "@loginom-ai-agent/schema/loginom"
import { supervise, superviseKnowledge } from "./supervisor"
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
  strictRecovery?: boolean
}) {
  if (![options.root, options.resources].every(isAbsolute)) throw new Error("LOGINOM_ABSOLUTE_PATH_REQUIRED")
  const root = options.root
  const resources = options.resources
  const environment = { ...(options.environment ?? process.env) }
  const inputs = inputStore(join(root, "inputs"))
  const journal = await recoveryStore(join(root, "recovery"), { strict: options.strictRecovery === true })
  const generations = new Map<
    number,
    {
      connection: ActiveConnection
      knowledge: Awaited<ReturnType<typeof superviseKnowledge>>
      catalog: Promise<unknown>
      ready: Promise<void>
      children: Map<string, Promise<Awaited<ReturnType<typeof supervise>>>>
    }
  >()
  const restarts = new Map<string, number>()
  const lost = new Set<string>()
  const stale = new Set<string>()
  type Runtime = Awaited<ReturnType<typeof supervise>>
  function retain(generation: { children: Map<string, Promise<Runtime>> }, chat: string, child: Promise<Runtime>) {
    const tracked = child.then((runtime) => {
      void runtime.exited.then(() => {
        if (generation.children.get(chat) !== tracked) return
        lost.add(chat)
        generation.children.delete(chat)
      })
      return runtime
    })
    generation.children.set(chat, tracked)
    tracked.catch(() => {
      if (generation.children.get(chat) === tracked) generation.children.delete(chat)
    })
    return tracked
  }
  async function launch(connection: ActiveConnection, chat: string, validation = false, signal?: AbortSignal) {
    const manifest = JSON.parse(await readFile(join(resources, "resource-manifest.json"), "utf8"))
    return supervise(
      {
        node: join(resources, "bin", process.platform === "win32" ? "node.exe" : "node"),
        entry: join(resources, "runtime/src/managed-entry.mjs"),
        resources,
        stateDir: join(root, validation ? "validation" : "runtime"),
        generation: connection.generation,
        chat,
        connection,
        validation,
        headless: validation || options.headless === true,
        environment,
        endpoint: environment.LOGINOM_AI_AGENT_KNOWLEDGE_ENDPOINT ?? manifest.endpoint,
        actionManifestUri: manifest.actionManifestUri,
        actionManifestSha256: manifest.actionManifestSha256,
      },
      signal,
    )
  }
  const service = await connectionService(
    connectionStore(join(root, "connection"), options.codec),
    {
      async check(connection, signal) {
        signal?.throwIfAborted()
        const chat = randomUUID()
        try {
          const manifest = JSON.parse(await readFile(join(resources, "resource-manifest.json"), "utf8"))
          const knowledge = await superviseKnowledge(
            {
              node: join(resources, "bin", process.platform === "win32" ? "node.exe" : "node"),
              entry: join(resources, "runtime/src/knowledge-entry.mjs"),
              stateDir: join(root, "validation", "knowledge", chat),
              generation: connection.generation,
              endpoint: environment.LOGINOM_AI_AGENT_KNOWLEDGE_ENDPOINT ?? manifest.endpoint,
              apiKey: connection.apiKey,
              environment,
            },
            signal,
          )
          const cancel = () => {
            void knowledge.close().catch(() => undefined)
          }
          signal?.addEventListener("abort", cancel, { once: true })
          try {
            signal?.throwIfAborted()
            await knowledge.request("list")
            signal?.throwIfAborted()
          } finally {
            signal?.removeEventListener("abort", cancel)
            await knowledge.close()
          }
          signal?.throwIfAborted()
          const child = await launch(connection, chat, true, signal).catch((error: unknown) => {
            if (error instanceof Error && Schema.is(Loginom.BrowserFailure)(error.message))
              return { state: "failed" as const, failure: error.message }
            throw error
          })
          if ("state" in child) return child
          await child.close()
          signal?.throwIfAborted()
          return { state: "verified" as const }
        } finally {
          await Promise.all([
            rm(join(root, "validation", "generations", String(connection.generation), "chats", chat), {
              recursive: true,
              force: true,
            }),
            rm(join(root, "validation", "knowledge", chat), { recursive: true, force: true }),
          ])
        }
      },
      async prepare(connection) {
        const manifest = JSON.parse(await readFile(join(resources, "resource-manifest.json"), "utf8"))
        const knowledge = await superviseKnowledge({
          node: join(resources, "bin", process.platform === "win32" ? "node.exe" : "node"),
          entry: join(resources, "runtime/src/knowledge-entry.mjs"),
          stateDir: join(root, "knowledge", String(connection.generation)),
          generation: connection.generation,
          endpoint: environment.LOGINOM_AI_AGENT_KNOWLEDGE_ENDPOINT ?? manifest.endpoint,
          apiKey: connection.apiKey,
          environment,
        })
        const catalog = knowledge.request("list")
        const ready = catalog.then(() => undefined)
        const generation = { connection, knowledge, catalog, ready, children: new Map<string, Promise<Runtime>>() }
        generations.set(connection.generation, generation)
        void ready.catch(() => undefined)
        return {
          ready,
          async reset() {
            const results = await Promise.allSettled(
              [...generation.children.entries()].map(async ([chat, child]) => {
                await (await child).close()
                generation.children.delete(chat)
              }),
            )
            if (results.some((result) => result.status === "rejected"))
              throw new Error("LOGINOM_RUNTIME_CLEANUP_FAILED")
          },
          async close() {
            generations.delete(connection.generation)
            const results = await Promise.allSettled([
              knowledge.close(),
              ...[...generation.children.values()].map(async (child) => (await child).close()),
            ])
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
    knowledge(generation: number) {
      const current = generations.get(generation)
      if (!current) throw new Error("LOGINOM_GENERATION_UNAVAILABLE")
      return current.knowledge
    },
    async catalog(generation: number) {
      const current = generations.get(generation)
      if (!current) throw new Error("LOGINOM_GENERATION_UNAVAILABLE")
      await current.ready
      return structuredClone(await current.catalog)
    },
    resetRestarts(chat: string) {
      restarts.delete(chat)
      lost.delete(chat)
    },
    markRuntimeStale(chat: string) {
      stale.add(chat)
    },
    async retireRuntime(chat: string) {
      if (!stale.delete(chat)) return
      const closing: Promise<void>[] = []
      for (const generation of generations.values()) {
        const child = generation.children.get(chat)
        if (!child) continue
        generation.children.delete(chat)
        closing.push(
          child
            .then((runtime) => runtime.close())
            .then(
              () => undefined,
              () => undefined,
            ),
        )
      }
      await Promise.all(closing)
      restarts.delete(chat)
      lost.delete(chat)
    },
    async interruptAll() {
      const results = await Promise.allSettled(
        [...generations.values()].flatMap((generation) => [
          generation.knowledge.request("interrupt", { all: true }),
          ...[...generation.children.values()].map(async (child) => (await child).request("interrupt")),
        ]),
      )
      if (results.some((result) => result.status === "rejected")) throw new Error("LOGINOM_RUNTIME_INTERRUPT_FAILED")
    },
    async inputs(generation: number, chat: string, userMessage: string, files: InputFile[]) {
      const current = generations.get(generation)
      if (!current) throw new Error("LOGINOM_GENERATION_UNAVAILABLE")
      return inputs.admit(`${generation}:${chat}`, userMessage, files, `/${current.connection.username}`)
    },
    hasRuntime(generation: number, chat: string) {
      return generations.get(generation)?.children.has(chat) === true
    },
    async workState(generation: number, chat: string) {
      // Inspect only the existing owner. Losing it is uncertainty, not evidence of idle work.
      if (lost.has(chat) || stale.has(chat)) throw new Error("LOGINOM_RUNTIME_UNAVAILABLE")
      const child = generations.get(generation)?.children.get(chat)
      if (!child) return { activeWork: false, unsettledWork: false, dispatching: false }
      const result = await (await child).request("work", undefined, 5000)
      if (
        !result ||
        typeof result !== "object" ||
        !("activeWork" in result) ||
        typeof result.activeWork !== "boolean" ||
        !("unsettledWork" in result) ||
        typeof result.unsettledWork !== "boolean" ||
        !("dispatching" in result) ||
        typeof result.dispatching !== "boolean"
      )
        throw new Error("LOGINOM_REPLY_INVALID")
      return { activeWork: result.activeWork, unsettledWork: result.unsettledWork, dispatching: result.dispatching }
    },
    async runtime(generation: number, chat: string) {
      const current = generations.get(generation)
      if (!current) throw new Error("LOGINOM_GENERATION_UNAVAILABLE")
      const previous = current.children.get(chat)
      if (previous) return previous
      if (lost.has(chat)) {
        const count = restarts.get(chat) ?? 0
        if (count >= 2) throw new Error("LOGINOM_RUNTIME_UNAVAILABLE")
        restarts.set(chat, count + 1)
        lost.delete(chat)
      }
      return retain(
        current,
        chat,
        launch(current.connection, chat).then(
          (child) => {
            service.browserStatus(generation, { state: "verified" })
            return child
          },
          (error: unknown) => {
            if (error instanceof Error && Schema.is(Loginom.BrowserFailure)(error.message))
              service.browserStatus(generation, { state: "failed", failure: error.message })
            throw error
          },
        ),
      )
    },
  }
}
