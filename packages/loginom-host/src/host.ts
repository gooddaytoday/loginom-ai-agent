import { inputStore, type InputFile } from "./inputs"
import { readFile, rm, open, lstat, unlink } from "node:fs/promises"
import { isAbsolute, join } from "node:path"
import { randomUUID } from "node:crypto"
import { supervise, type LoginBarrier } from "./supervisor"
import { connectionService } from "./connection/connection-service"
import { connectionStore, type ActiveConnection } from "./connection/connection-store"
import type { CredentialCodec } from "./connection/credentials"
import { recoveryStore } from "./connection/recovery-store"
import { readSessionRegistration, sessionCompletion } from "./session-completion"

export async function createLoginomHost(options: {
  root: string
  resources: string
  codec: CredentialCodec
  environment?: NodeJS.ProcessEnv
  headless?: boolean
  strictRecovery?: boolean
  loginBarrier?: LoginBarrier
}) {
  if (![options.root, options.resources].every(isAbsolute)) throw new Error("LOGINOM_ABSOLUTE_PATH_REQUIRED")
  const root = options.root
  const resources = options.resources
  const environment = { ...(options.environment ?? process.env) }
  const inputs = inputStore(join(root, "inputs"))
  const registration = await readSessionRegistration(root)
  const barrier = options.loginBarrier
  if ((registration?.version === 2) !== (typeof barrier === "function")) throw Error("LOGINOM_LOGIN_BARRIER_REQUIRED")
  const pendingLogin = join(root, "login-barrier-pending.json")
  if (
    registration?.version === 2 &&
    (await lstat(pendingLogin).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return false
        throw Error("LOGINOM_LOGIN_BARRIER_UNKNOWN")
      },
    ))
  )
    throw Error("LOGINOM_LOGIN_BARRIER_UNKNOWN")
  const loginState = { active: false, failed: false, count: 0 }
  const journal = await recoveryStore(join(root, "recovery"), {
    strict: options.strictRecovery === true || !!registration,
  })
  const generations = new Map<
    number,
    { connection: ActiveConnection; children: Map<string, Promise<Awaited<ReturnType<typeof supervise>>>> }
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
  async function launch(connection: ActiveConnection, chat: string, validation = false) {
    const manifest = JSON.parse(await readFile(join(resources, "resource-manifest.json"), "utf8"))
    if (barrier && (loginState.active || loginState.failed || loginState.count >= 32))
      throw Error("LOGINOM_LOGIN_BARRIER_UNKNOWN")
    const loginBinding =
      barrier && registration
        ? Object.freeze({
            attemptId: registration.attemptId,
            loginId: randomUUID(),
            generation: connection.generation,
            purpose: validation
              ? ("validation" as const)
              : chat === "readiness"
                ? ("readiness" as const)
                : ("chat" as const),
            chat,
            account: connection.username,
          })
        : undefined
    let loginStamp: { dev: number; ino: number } | undefined
    if (loginBinding) {
      loginState.active = true
      loginState.count++
      try {
        const file = await open(pendingLogin, "wx", 0o600)
        try {
          await file.writeFile(JSON.stringify(loginBinding) + "\n")
          await file.sync()
          loginStamp = await file.stat()
        } finally {
          await file.close()
        }
        const directory = await open(root, "r")
        try {
          await directory.sync()
        } finally {
          await directory.close()
        }
      } catch {
        loginState.failed = true
        throw Error("LOGINOM_LOGIN_BARRIER_UNKNOWN")
      }
    }
    try {
      const runtime = await supervise({
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
        loginBinding,
        loginBarrier: barrier,
        trustedAttempt: registration ? { attemptId: registration.attemptId } : undefined,
      })
      if (loginBinding) {
        try {
          const current = await lstat(pendingLogin)
          if (!loginStamp || !current.isFile() || current.dev !== loginStamp.dev || current.ino !== loginStamp.ino)
            throw Error("LOGINOM_LOGIN_BARRIER_UNKNOWN")
          await unlink(pendingLogin)
          const directory = await open(root, "r")
          try {
            await directory.sync()
          } finally {
            await directory.close()
          }
        } catch {
          await runtime.close().catch(() => undefined)
          throw Error("LOGINOM_LOGIN_BARRIER_UNKNOWN")
        }
        loginState.active = false
      }
      return runtime
    } catch (error) {
      if (loginBinding) {
        loginState.failed = true
        throw Error("LOGINOM_LOGIN_BARRIER_UNKNOWN")
      }
      throw error
    }
  }
  const sessions = await sessionCompletion({
    root,
    registration,
    journal,
    idle: () => service.idle(),
    runtime: async (generation, chat) => generations.get(generation)?.children.get(chat),
  })
  const service = await connectionService(
    connectionStore(join(root, "connection"), options.codec),
    {
      async check(connection) {
        if (sessions.blocked() || sessions.completed()) throw Error("LOGINOM_SESSION_BUSY")
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
        if (sessions.blocked() || sessions.completed()) throw Error("LOGINOM_SESSION_BUSY")
        const child = await launch(connection, "readiness")
        const generation = { connection, children: new Map<string, Promise<Runtime>>() }
        generations.set(connection.generation, generation)
        retain(generation, "readiness", Promise.resolve(child))
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
  async function view() {
    return {
      ...(await service.api.read()),
      ...(registration
        ? {
            sessionCompletion: sessions.completed()
              ? ("completed" as const)
              : sessions.blocked()
                ? ("pending" as const)
                : ("open" as const),
          }
        : {}),
    }
  }
  return {
    ...service,
    acquire(run: string) {
      if (loginState.failed || loginState.active) throw Error("LOGINOM_LOGIN_BARRIER_UNKNOWN")
      if (sessions.blocked() || sessions.completed()) return
      return service.acquire(run)
    },
    sessionApi: {
      sessionCompletionOptions: sessions.options,
      finishOwnSession: sessions.finish,
    },
    api: {
      ...service.api,
      read: view,
      status: view,
      async check(input: Parameters<typeof service.api.check>[0]) {
        if (sessions.blocked() || sessions.completed()) throw Error("LOGINOM_SESSION_BUSY")
        return service.api.check(input)
      },
      async save(input: Parameters<typeof service.api.save>[0]) {
        if (sessions.blocked() || sessions.completed()) throw Error("LOGINOM_SESSION_BUSY")
        return service.api.save(input)
      },
      async cancelPending(input: Parameters<typeof service.api.cancelPending>[0]) {
        if (sessions.blocked() || sessions.completed()) throw Error("LOGINOM_SESSION_BUSY")
        return service.api.cancelPending(input)
      },
      async acknowledgeRecovery(input: Parameters<typeof service.api.acknowledgeRecovery>[0]) {
        if (sessions.blocked()) throw Error("LOGINOM_RECOVERY_BUSY")
        const view = await service.api.acknowledgeRecovery(input)
        recoveries.clear()
        return view
      },
    },
    journal,
    recoveries,
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
      if (loginState.failed) throw Error("LOGINOM_LOGIN_BARRIER_UNKNOWN")
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
      return retain(current, chat, launch(current.connection, chat))
    },
  }
}
