import {rootHostOptions} from './original-root-association'
import {getFPHostStartup} from "./fp-startup-control"
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
  strictRecovery?: boolean
  // Acceptance-only forwarding of the existing managed shutdown binding.
  acceptanceCleanupPackage?: string
  acceptanceCapture?: { authorization: string; packagePath: string; harness: "sorting-before-close-v1" | "field-parameters-preservation-v1" }
}) {
  if (![options.root, options.resources].every(isAbsolute)) throw new Error("LOGINOM_ABSOLUTE_PATH_REQUIRED")
  const rootOrigin=rootHostOptions(options)
  const fpStartup=getFPHostStartup(options)
  if(options.acceptanceCapture?.harness==='field-parameters-preservation-v1' && !fpStartup)
    throw Error('LOGINOM_HANDSHAKE_INVALID')
  try {
  fpStartup?.guard()
  const root = options.root
  const resources = options.resources
  const environment = { ...(options.environment ?? process.env) }
  const inputs = inputStore(join(root, "inputs"))
  // A closed diagnostic capture retains uncertainty durably even when ordinary
  // model calls use advisory recovery. Caller settings cannot weaken admission.
  const journal = await recoveryStore(join(root, "recovery"), {
    strict: options.acceptanceCapture !== undefined || options.strictRecovery === true,
  }).catch(error=>{throw fpStartup?fpStartup.forward(fpStartup.reject(error)):error})
  fpStartup?.guard()
  const generations = new Map<
    number,
    { connection: ActiveConnection; children: Map<string, Promise<Awaited<ReturnType<typeof supervise>>>> }
  >()
  const restarts = new Map<string, number>()
  const lost = new Set<string>()
  const stale = new Set<string>()
  type CaptureBinding = NonNullable<Parameters<typeof supervise>[0]["acceptanceCapture"]>
  const captures = new Map<string, CaptureBinding>()
  const captureLeases = new Map<string, NonNullable<ReturnType<typeof service.acquire>>>()
  type Runtime = Awaited<ReturnType<typeof supervise>>
  // Includes validation and failed-start children, even without a prepared
  // service handle. Removal requires confirmed close/exit, never merely failure.
  const owners = new Map<string, { child?: Runtime; settled: Promise<void>; failure?: { value: unknown } }>()
  function guardOwners() {
    const refused = [...owners.values()].find(owner => owner.failure)
    if (refused) throw new Error("LOGINOM_RUNTIME_CLEANUP_FAILED", { cause: refused.failure!.value })
  }
  async function closeOwners() {
    const results = await Promise.allSettled([...owners.entries()].map(async ([key, owner]) => {
      await owner.settled
      await owner.child?.close()
      if (owners.get(key) === owner) owners.delete(key)
    }))
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected")
    if (failures.length) throw new AggregateError(failures.map(result => result.reason), "LOGINOM_RUNTIME_CLEANUP_FAILED", { cause: failures[0]!.reason })
  }
  function retain(
    generation: { children: Map<string, Promise<Runtime>> },
    chat: string,
    child: Promise<Runtime>,
  ) {
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
  async function launch(connection: ActiveConnection, chat: string, validation = false, acceptanceCapture?: CaptureBinding, startup=undefined as typeof fpStartup) {
    startup?.guard()
    guardOwners()
    const manifest = await readFile(join(resources, "resource-manifest.json"), "utf8").then(text=>JSON.parse(text)).catch(error=>{throw startup?startup.forward(startup.reject(error)):error})
    startup?.guard()
    const key = `${validation ? "validation" : "runtime"}:${connection.generation}:${chat}`
    const owner: { child?: Runtime; settled: Promise<void>; failure?: { value: unknown } } = { settled: Promise.resolve() }
    owners.set(key, owner)
    const launched = supervise({
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
      acceptanceCleanupPackage: options.acceptanceCleanupPackage,
      acceptanceCapture,
    }, startup ? {...startup.control,...startup.tuple,guard:startup.guard,reject:startup.propagate,
      receive:startup.receive,retain:child=>{owner.child=child}} : undefined,rootOrigin)
    owner.settled = launched.then(child => { owner.child = child }, error => {
      owner.failure = { value: error }
      owner.child = error?.runtime ?? owner.child
      if (!owner.child && owners.get(key) === owner) owners.delete(key)
    })
    return launched
  }
  const service = await connectionService(
    connectionStore(join(root, "connection"), options.codec),
    {
      async check(connection) {
        const chat = randomUUID()
        try {
          const child = await launch(connection, chat, true)
          await child.close()
          await rm(join(root, "validation", "generations", String(connection.generation), "chats", chat), {
            recursive: true,
            force: true,
          })
          owners.delete(`validation:${connection.generation}:${chat}`)
        } catch (error) {
          const owner = owners.get(`validation:${connection.generation}:${chat}`)
          if (owner) owner.failure = { value: error }
          // Failed chat contains the original authentication/native/persistence
          // evidence. Do not erase it, including after confirmed cleanup.
          throw error
        }
      },
      close: closeOwners,
      async prepare(connection,startup) {
        const child = await launch(connection, "readiness",false,undefined,startup)
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
            const results = await Promise.allSettled(
              [...generation.children.values()].map(async (child) => (await child).close()),
            )
            if (results.some((result) => result.status === "rejected"))
              throw new Error("LOGINOM_RUNTIME_CLEANUP_FAILED")
            generations.delete(connection.generation)
          },
        }
      },
    },
    journal,
    fpStartup,
  )
  fpStartup?.guard()
  const recoveries = new Map<string, NonNullable<ReturnType<typeof service.acquire>>>()
  return {
    ...service,
    api: {
      ...service.api,
      async check(input: Parameters<typeof service.api.check>[0]) {
        guardOwners()
        return service.api.check(input)
      },
      async save(input: Parameters<typeof service.api.save>[0]) {
        guardOwners()
        return service.api.save(input)
      },
      async acknowledgeRecovery(input: Parameters<typeof service.api.acknowledgeRecovery>[0]) {
        guardOwners()
        const view = await service.api.acknowledgeRecovery(input)
        recoveries.clear()
        return view
      },
    },
    acquire(run: string) {
      if ([...owners.values()].some(owner => owner.failure)) return
      return service.acquire(run)
    },
    journal,
    recoveries,
    authorizeCapture(authorization: unknown, owner?: string, run?: string, chat?: string, lease?: unknown) {
      if (!options.acceptanceCapture || authorization !== options.acceptanceCapture.authorization) return false
      const bound=chat?captures.get(chat):undefined
      return !!bound && bound.owner===owner && bound.run===run && bound.chat===chat
        && bound.expires>Date.now() && captureLeases.get(chat!)===lease
        && generations.get(bound.generation)?.connection.username===bound.account
        && !lost.has(chat!) && !stale.has(chat!)
    },
    bindCapture(owner: string, run: string, chat: string, lease: NonNullable<ReturnType<typeof service.acquire>>) {
      if(fpStartup)throw Error("LOGINOM_FP_CAPTURE_NOT_ADMITTED")
      if (!options.acceptanceCapture) return
      const current = generations.get(lease.generation)
      if (!current || current.children.has(chat) || captures.has(chat) || captures.size !== 0
          || !options.acceptanceCapture.packagePath.startsWith(`/${current.connection.username}/`))
        throw Error("LOGINOM_HANDSHAKE_INVALID")
      captures.set(chat, { revision: 1, harness: "sorting-before-close-v1", owner, run,
        lease: `${owner}:${run}`, generation: lease.generation, chat, account: current.connection.username,
        packagePath: options.acceptanceCapture.packagePath, admission: randomUUID(), expires: Date.now()+600000 })
      captureLeases.set(chat,lease)
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
        closing.push(child.then((runtime) => runtime.close()).then(() => undefined, () => undefined))
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
      const current = generations.get(generation)
      if (!current) throw new Error("LOGINOM_GENERATION_UNAVAILABLE")
      const previous = current.children.get(chat)
      if (previous) return previous
      if (captures.has(chat) && (lost.has(chat) || stale.has(chat))) throw Error("LOGINOM_RUNTIME_UNAVAILABLE")
      if (lost.has(chat)) {
        const count = restarts.get(chat) ?? 0
        if (count >= 2) throw new Error("LOGINOM_RUNTIME_UNAVAILABLE")
        restarts.set(chat, count + 1)
        lost.delete(chat)
      }
      return retain(current, chat, launch(current.connection, chat, false, captures.get(chat)))
    },
  }  }catch(error){throw fpStartup?fpStartup.forward(error):error}
}
