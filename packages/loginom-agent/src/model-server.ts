import { ModelID, ModelServerRpc, providerPrefix } from "@loginom-ai-agent/loginom-host/model-server-rpc"
import type { RpcHandlers } from "@opencode/plugin/effect/rpc"
import type { ConfigProvider } from "@opencode/schema/config/provider"
import { Model } from "@opencode/schema/model"
import { Effect, Schema } from "effect"
import { randomUUID } from "node:crypto"
import { ServiceHost } from "./host"

const response = Schema.Struct({ data: Schema.Array(Schema.Struct({ id: Schema.String })) })

function addressOf(address: string, key?: string) {
  const url = URL.parse(address.trim())
  if (
    !url ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    /[?#]|\{(?:env|file):/u.test(url.href)
  )
    return
  const baseURL = url.href.replace(/\/+$/u, "")
  if (!key || !baseURL.includes(key)) return baseURL
}

function deviceAddressAllowed(address: string) {
  if (!ServiceHost.connectionSettings.deviceOnly()) return true
  const { hostname } = new URL(address)
  return hostname === "localhost" || hostname === "[::1]" || /^127(?:\.\d{1,3}){3}$/u.test(hostname)
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

const usable = (id: string, key?: string) => Schema.is(ModelID)(id) && (!key || !id.includes(key))

export function modelServerHandlers(options: {
  fetch: (url: string, options: RequestInit) => Promise<Response>
  allowed: (id: string) => Effect.Effect<boolean>
  save: (id: string, provider: ConfigProvider.Info, key: string | undefined) => Effect.Effect<void, unknown>
}) {
  return {
    discover: (input) =>
      Effect.gen(function* () {
        const baseURL = addressOf(input.address, input.key)
        if (!baseURL) return { ok: false, issue: "modelServerAddressInvalid" }
        if (!deviceAddressAllowed(baseURL)) return { ok: false, issue: "modelServerDeviceOnly" }
        if (!(yield* options.allowed(`${providerPrefix}${randomUUID()}`)))
          return { ok: false, issue: "modelServerDenied" }
        return yield* Effect.promise(async (signal) => {
          try {
            const reply = await options.fetch(`${baseURL}/models`, {
              redirect: "error",
              signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
              headers: input.key ? { Authorization: `Bearer ${input.key}` } : undefined,
            })
            const entries = await readModels(reply)
            const models = [...new Set(entries.map((entry) => entry.id).filter((id) => usable(id, input.key)))].slice(
              0,
              4096,
            )
            if (models.length === 0) return { ok: false, issue: "modelServerNoModels" } as const
            return { ok: true, value: models } as const
          } catch {
            return { ok: false, issue: "modelServerDiscoveryFailed" } as const
          }
        })
      }),
    save: (input) =>
      Effect.gen(function* () {
        const baseURL = addressOf(input.address, input.key)
        if (!baseURL) return { ok: false, issue: "modelServerAddressInvalid" }
        if (!deviceAddressAllowed(baseURL)) return { ok: false, issue: "modelServerDeviceOnly" }
        if (!input.models.every((id) => usable(id, input.key))) return { ok: false, issue: "modelServerSaveFailed" }
        const providerID = `${providerPrefix}${randomUUID()}`
        if (!(yield* options.allowed(providerID))) return { ok: false, issue: "modelServerDenied" }
        return yield* options
          .save(
            providerID,
            {
              name: new URL(baseURL).host,
              package: "@opencode/ai/providers/openai-compatible",
              settings: { baseURL },
              models: Object.fromEntries(
                input.models.map((id) => [id, { modelID: Model.ID.make(id), name: id, type: "chat" }]),
              ),
            },
            input.key || undefined,
          )
          .pipe(
            Effect.as({ ok: true, value: { providerID } } as const),
            Effect.catchCause(() => Effect.succeed({ ok: false, issue: "modelServerSaveFailed" } as const)),
          )
      }),
  } satisfies RpcHandlers<typeof ModelServerRpc>
}
