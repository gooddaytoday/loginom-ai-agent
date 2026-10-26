import { afterEach, expect } from "bun:test"
import { createServer, type Server } from "node:http"
import { streamText } from "ai"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Effect } from "effect"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { disposeAllInstances, provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { testProviderConfig } from "../lib/test-provider"
import { Env } from "@/env"
import { Plugin } from "@/plugin"
import { Provider } from "@/provider/provider"
import { ProviderError } from "@/provider/error"
import { MessageV2 } from "@/session/message-v2"
import { SessionRetry } from "@/session/retry"

afterEach(async () => {
  await disposeAllInstances()
})

const it = testEffect(
  LayerNode.compile(LayerNode.group([Provider.node, Env.node, Plugin.node, CrossSpawnSpawner.node])),
)

it.live("headerTimeout does not abort delayed SSE body after headers arrive", () =>
  Effect.gen(function* () {
    const server = yield* Effect.acquireRelease(
      Effect.promise(() => delayedBodyServer(1_000)),
      (server) => Effect.sync(() => server.server.close()),
    )

    yield* provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const provider = yield* Provider.Service
          const model = yield* provider.getModel(ProviderV2.ID.make("test"), ModelV2.ID.make("test-model"))
          const result = streamText({
            model: yield* provider.getLanguage(model),
            messages: [{ role: "user", content: "hello" }],
          })

          expect(yield* Effect.promise(() => result.text)).toBe("late")
        }),
      { config: providerConfig(server.url, { headerTimeout: 500 }) },
    )
  }),
)

for (const timeout of ["chunkTimeout", "headerTimeout"] as const) {
  it.live(`default ${timeout} is applied at fetch without changing provider options`, () =>
    Effect.gen(function* () {
      const server = yield* Effect.acquireRelease(
        Effect.promise(() => delayedBodyServer(250)),
        (server) => Effect.sync(() => server.server.close()),
      )

      yield* provideTmpdirInstance(
        () =>
          Effect.gen(function* () {
            const provider = yield* Provider.Service
            const configured = yield* provider.getProvider(ProviderV2.ID.make("test"))
            const signals: (AbortSignal | null | undefined)[] = []
            configured.options.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
              signals.push(init?.signal)
              return fetch(input, init)
            }
            const model = yield* provider.getModel(ProviderV2.ID.make("test"), ModelV2.ID.make("test-model"))
            const language = yield* provider.getLanguage(model)
            yield* Effect.acquireRelease(
              Effect.promise(() =>
                language.doStream({ prompt: [{ role: "user", content: [{ type: "text", text: "hello" }] }] }),
              ),
              (result) => Effect.promise(() => result.stream.cancel()),
            )

            expect(signals).toHaveLength(1)
            expect(signals[0]).toBeInstanceOf(AbortSignal)
            expect(configured.options[timeout]).toBeUndefined()
          }),
        {
          config: providerConfig(server.url, {
            [timeout === "chunkTimeout" ? "headerTimeout" : "chunkTimeout"]: false,
          }),
        },
      )
    }),
  )
}

it.live("configured chunkTimeout raises a retryable response stream error when SSE body stalls", () =>
  Effect.gen(function* () {
    const server = yield* Effect.acquireRelease(
      Effect.promise(() => delayedBodyServer(250)),
      (server) => Effect.sync(() => server.server.close()),
    )

    yield* provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const provider = yield* Provider.Service
          const model = yield* provider.getModel(ProviderV2.ID.make("test"), ModelV2.ID.make("test-model"))
          const result = streamText({
            model: yield* provider.getLanguage(model),
            onError() {},
            messages: [{ role: "user", content: "hello" }],
          })

          const error = yield* Effect.promise(async () => {
            try {
              for await (const part of result.fullStream) {
                if (part.type === "error") return part.error
              }
            } catch (error) {
              return error
            }
          })
          expect(error).toBeInstanceOf(ProviderError.ResponseStreamError)
          expect(
            SessionRetry.retryable(MessageV2.fromError(error, { providerID: model.providerID }), model.providerID),
          ).toEqual({ message: "SSE read timed out" })
        }),
      { config: providerConfig(server.url, { chunkTimeout: 50 }) },
    )
  }),
)

it.live("chunkTimeout can be disabled with false", () =>
  Effect.gen(function* () {
    const server = yield* Effect.acquireRelease(
      Effect.promise(() => delayedBodyServer(250)),
      (server) => Effect.sync(() => server.server.close()),
    )

    yield* provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const provider = yield* Provider.Service
          const configured = yield* provider.getProvider(ProviderV2.ID.make("test"))
          expect(configured.options.chunkTimeout).toBe(false)
          const model = yield* provider.getModel(ProviderV2.ID.make("test"), ModelV2.ID.make("test-model"))
          const result = streamText({
            model: yield* provider.getLanguage(model),
            messages: [{ role: "user", content: "hello" }],
          })

          expect(yield* Effect.promise(() => result.text)).toBe("late")
        }),
      { config: providerConfig(server.url, { chunkTimeout: false }) },
    )
  }),
)

it.live("headerTimeout aborts when response headers do not arrive", () =>
  Effect.gen(function* () {
    const server = yield* Effect.acquireRelease(
      Effect.promise(() => delayedHeaderServer(250)),
      (server) => Effect.sync(() => server.server.close()),
    )

    yield* provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const provider = yield* Provider.Service
          const model = yield* provider.getModel(ProviderV2.ID.make("test"), ModelV2.ID.make("test-model"))
          const result = streamText({
            model: yield* provider.getLanguage(model),
            onError() {},
            messages: [{ role: "user", content: "hello" }],
          })

          const errors = yield* Effect.promise(async () => {
            const errors: string[] = []
            for await (const part of result.fullStream) {
              if (part.type === "error") errors.push(String(part.error))
            }
            return errors
          })
          expect(errors.join("\n")).toContain("response headers timed out")
        }),
      { config: providerConfig(server.url, { headerTimeout: 50 }) },
    )
  }),
)

for (const mode of ["typed", "generic", "caller", "caller-after-header", "unowned"] as const) {
  it.live(`pre-header ${mode} abort preserves timeout retries and caller cancellation`, () =>
    provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const provider = yield* Provider.Service
          const providerID = ProviderV2.ID.make("test")
          const configured = yield* provider.getProvider(providerID)
          const caller = new AbortController()
          const cancellation = new DOMException("Aborted", "AbortError")
          let calls = 0
          configured.options.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
            calls++
            if (calls > 1)
              return new Response('data: {"choices":[{"delta":{"content":"recovered"}}]}\n\ndata: [DONE]\n\n', {
                headers: { "content-type": "text/event-stream" },
              })
            if (mode === "unowned") throw cancellation
            const signal = init?.signal
            if (!signal) throw new Error("expected provider signal")
            return new Promise<Response>((_resolve, reject) => {
              signal.addEventListener(
                "abort",
                () => {
                  if (mode === "caller-after-header") caller.abort(cancellation)
                  reject(mode === "typed" ? signal.reason : cancellation)
                },
                { once: true },
              )
              if (mode === "caller") caller.abort(cancellation)
            })
          }
          const model = yield* provider.getModel(providerID, ModelV2.ID.make("test-model"))
          const language = yield* provider.getLanguage(model)
          const retries: number[] = []
          const errors: ReturnType<typeof MessageV2.fromError>[] = []
          const result = yield* Effect.tryPromise({
            try: async () => {
              const result = streamText({
                model: language,
                abortSignal: caller.signal,
                maxRetries: 0,
                onError() {},
                messages: [{ role: "user", content: "hello" }],
              })
              for await (const part of result.fullStream) {
                if (part.type === "error") throw part.error
                if (part.type === "abort") throw cancellation
              }
              return result.text
            },
            catch: (error) => {
              errors.push(MessageV2.fromError(error, { providerID }))
              return error
            },
          }).pipe(
            Effect.retry(
              SessionRetry.policy({
                provider: providerID,
                parse: (error) => MessageV2.fromError(error, { providerID }),
                set: (info) =>
                  Effect.sync(() => {
                    retries.push(info.attempt)
                  }),
              }),
            ),
            Effect.result,
          )
          if (mode === "typed" || mode === "generic") {
            expect(result).toMatchObject({ _tag: "Success", success: "recovered" })
            expect(calls).toBe(2)
            expect(retries).toEqual([1])
            expect(errors).toHaveLength(1)
            expect(errors[0]).toMatchObject({ name: "APIError", data: { isRetryable: true } })
            return
          }
          expect(result._tag).toBe("Failure")
          expect(calls).toBe(1)
          expect(retries).toEqual([])
          expect(errors).toMatchObject([{ name: "MessageAbortedError" }])
        }),
      { config: providerConfig("http://127.0.0.1/unused", { headerTimeout: 50, chunkTimeout: false }) },
    ),
  )
}

it.live("headerTimeout can be disabled with false for non-OpenAI providers", () =>
  Effect.gen(function* () {
    const server = yield* Effect.acquireRelease(
      Effect.promise(() => delayedHeaderServer(100)),
      (server) => Effect.sync(() => server.server.close()),
    )

    yield* provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const provider = yield* Provider.Service
          const model = yield* provider.getModel(ProviderV2.ID.make("test"), ModelV2.ID.make("test-model"))
          const result = streamText({
            model: yield* provider.getLanguage(model),
            messages: [{ role: "user", content: "hello" }],
          })

          expect(yield* Effect.promise(() => result.text)).toBe("ok")
        }),
      { config: providerConfig(server.url, { headerTimeout: false }) },
    )
  }),
)

it.live("OpenAI Codex header and chunk timeout defaults can be disabled by config", () =>
  Effect.gen(function* () {
    yield* withAuthContent(
      Effect.gen(function* () {
        yield* provideTmpdirInstance(
          () =>
            Effect.gen(function* () {
              const provider = yield* Provider.Service
              const openai = yield* provider.getProvider(ProviderV2.ID.openai)
              expect(openai.options.headerTimeout).toBe(false)
              expect(openai.options.chunkTimeout).toBe(false)
            }),
          { config: { provider: { openai: { options: { headerTimeout: false, chunkTimeout: false } } } } },
        )
      }),
    )
  }),
)

it.live("OpenAI API auth gets default headerTimeout", () =>
  Effect.gen(function* () {
    yield* withAuthContent(
      Effect.gen(function* () {
        yield* provideTmpdirInstance(() =>
          Effect.gen(function* () {
            const provider = yield* Provider.Service
            const openai = yield* provider.getProvider(ProviderV2.ID.openai)
            expect(openai.options.headerTimeout).toBe(300_000)
          }),
        )
      }),
      { openai: { type: "api", key: "sk-test" } },
    )
  }),
)

function providerConfig(url: string, options: Record<string, unknown> = {}) {
  const config = testProviderConfig(url)
  return {
    ...config,
    provider: {
      test: {
        ...config.provider.test,
        options: { ...config.provider.test.options, ...options },
      },
    },
  }
}

async function delayedHeaderServer(delay: number): Promise<{ server: Server; url: string }> {
  const server = createServer((_, res) => {
    setTimeout(() => {
      res.writeHead(200, { "content-type": "text/event-stream" })
      res.end('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n')
    }, delay)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("server did not bind to a TCP port")
  return { server, url: `http://127.0.0.1:${address.port}` }
}

async function delayedBodyServer(delay: number): Promise<{ server: Server; url: string }> {
  const server = createServer((_, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" })
    res.flushHeaders()
    setTimeout(() => {
      res.end('data: {"choices":[{"delta":{"content":"late"}}]}\n\ndata: [DONE]\n\n')
    }, delay)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("server did not bind to a TCP port")
  return { server, url: `http://127.0.0.1:${address.port}` }
}

function withAuthContent<A, E, R>(self: Effect.Effect<A, E, R>, value: Record<string, unknown> = defaultAuthContent()) {
  return Effect.acquireUseRelease(
    Effect.sync(() => {
      const previous = process.env.LOGINOM_AI_AGENT_AUTH_CONTENT
      process.env.LOGINOM_AI_AGENT_AUTH_CONTENT = JSON.stringify(value)
      return previous
    }),
    () => self,
    (previous) =>
      Effect.sync(() => {
        if (previous === undefined) delete process.env.LOGINOM_AI_AGENT_AUTH_CONTENT
        else process.env.LOGINOM_AI_AGENT_AUTH_CONTENT = previous
      }),
  )
}

function defaultAuthContent() {
  return {
    openai: { type: "oauth", refresh: "refresh", access: "access", expires: Date.now() + 60_000 },
  }
}
