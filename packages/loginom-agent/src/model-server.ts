import { providerPrefix } from "@loginom-ai-agent/loginom-host/model-server-id"
import { modelServerSecretMinLength } from "@loginom-ai-agent/loginom-host/model-server-key"
import { ModelID, ModelServerRpc } from "@loginom-ai-agent/loginom-host/model-server-rpc"
import type { RpcHandlers } from "@opencode/plugin/effect/rpc"
import type { ConfigProvider } from "@opencode/schema/config/provider"
import { Model } from "@opencode/schema/model"
import { Effect, Schema } from "effect"
import { createHash } from "node:crypto"
import { resolveModelServer } from "./model-server-network"

const response = Schema.Struct({ data: Schema.Array(Schema.Struct({ id: Schema.String })) })

function addressOf(address: string) {
  const url = URL.parse(address.trim())
  if (
    !url ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    /[?#]|\{(?:env|file):/u.test(url.href)
  )
    return
  return url.href.replace(/\/+$/u, "")
}

async function readModels(reply: Response) {
  if (!reply.ok || !reply.body) throw new Error("Model discovery failed")
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ""
  for await (const chunk of reply.body) {
    bytes += chunk.byteLength
    if (bytes > 2_000_000) throw new Error("Model catalog is too large")
    text += decoder.decode(chunk, { stream: true })
  }
  return Schema.decodeUnknownSync(response)(JSON.parse(text + decoder.decode())).data
}

const usable = Schema.is(ModelID)
const providerIDFor = (address: string) => `${providerPrefix}${createHash("sha256").update(address).digest("hex")}`

function withoutSecretIDs(ids: readonly string[], key?: string) {
  const secret = key?.trim()
  return secret && secret.length >= modelServerSecretMinLength ? ids.filter((id) => !id.includes(secret)) : ids
}

export function modelServerHandlers(options: {
  catalogAvailable: Effect.Effect<boolean>
  allowed: (id: string) => Effect.Effect<boolean>
  save: (
    id: string,
    provider: ConfigProvider.Info,
    key: string | undefined,
  ) => Effect.Effect<string | undefined, unknown>
  remove: (id: string) => Effect.Effect<"modelServerRemoveProfileFailed" | undefined, unknown>
}) {
  return {
    catalogAvailable: () => Effect.map(options.catalogAvailable, (value) => ({ ok: true, value }) as const),
    discover: (input) =>
      Effect.gen(function* () {
        const baseURL = addressOf(input.address)
        if (!baseURL) return { ok: false, issue: "modelServerAddressInvalid" }
        if (!(yield* options.allowed(providerIDFor(baseURL)))) return { ok: false, issue: "modelServerDenied" }
        return yield* Effect.promise(async (signal) => {
          try {
            const deadline = AbortSignal.any([signal, AbortSignal.timeout(10_000)])
            const target = await resolveModelServer(`${baseURL}/models`, deadline)
            if (!target.ok) return target
            const reply = await target.request({
              signal: deadline,
              headers: input.key ? { Authorization: `Bearer ${input.key}` } : undefined,
            })
            const entries = await readModels(reply)
            const ids = entries.map((entry) => entry.id).filter(usable)
            const models = [...new Set(withoutSecretIDs(ids, input.key))].slice(0, 4096)
            if (models.length === 0) return { ok: false, issue: "modelServerNoModels" } as const
            return { ok: true, value: models } as const
          } catch {
            return { ok: false, issue: "modelServerDiscoveryFailed" } as const
          }
        })
      }),
    save: (input) =>
      Effect.gen(function* () {
        const baseURL = addressOf(input.address)
        if (!baseURL) return { ok: false, issue: "modelServerAddressInvalid" }
        if (!input.models.every(usable)) return { ok: false, issue: "modelServerSaveFailed" }
        const models = withoutSecretIDs(input.models, input.key)
        if (models.length === 0) return { ok: false, issue: "modelServerNoModels" }
        const verdict = yield* Effect.tryPromise({
          try: (signal) =>
            resolveModelServer(baseURL, AbortSignal.any([signal, AbortSignal.timeout(10_000)])),
          catch: () => ({ ok: false, issue: "modelServerAddressInvalid" }) as const,
        }).pipe(Effect.catch(Effect.succeed))
        if (!verdict.ok) return verdict
        const url = new URL(baseURL)
        return yield* options
          .save(
            providerIDFor(baseURL),
            {
              name: `${url.host}${url.pathname === "/" ? "" : url.pathname}`,
              package: "@opencode/ai/providers/openai-compatible",
              settings: { baseURL },
              models: Object.fromEntries(
                models.map((id) => [id, { modelID: Model.ID.make(id), name: id, type: "chat" }]),
              ),
            },
            input.key || undefined,
          )
          .pipe(
            Effect.map((providerID) =>
              providerID
                ? ({ ok: true, value: { providerID } } as const)
                : ({ ok: false, issue: "modelServerDenied" } as const),
            ),
            Effect.catchCause(() => Effect.succeed({ ok: false, issue: "modelServerSaveFailed" } as const)),
          )
      }),
    remove: ({ providerID }) =>
      options.remove(providerID).pipe(
        Effect.map((issue) => (issue ? ({ ok: false, issue } as const) : ({ ok: true, value: true } as const))),
        Effect.catchCause(() => Effect.succeed({ ok: false, issue: "modelServerRemoveFailed" } as const)),
      ),
  } satisfies RpcHandlers<typeof ModelServerRpc>
}
