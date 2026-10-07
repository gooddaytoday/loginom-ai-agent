import path from "node:path"

const [dir, url, mode = "run"] = process.argv.slice(2)
process.env.LOGINOM_AI_AGENT_CLI_ROOT = path.join(dir, `profile-${process.pid}`)
process.env.LOGINOM_AI_AGENT_SHARED_AUTH_DIR = dir
try {
  const { CodexAuthPlugin } = await import("../../src/plugin/openai/codex")
  const { Auth } = await import("../../src/auth")
  const { LayerNode } = await import("@loginom-ai-agent/core/effect/layer-node")
  const { Effect } = await import("effect")
  const layer = LayerNode.compile(Auth.node)
  const getAuth = () =>
    Effect.runPromise(Effect.flatMap(Auth.Service, (auth) => auth.get("openai")).pipe(Effect.provide(layer)))
  const hooks = await CodexAuthPlugin(
    {
      client: {
        auth: {
          set: () => {
            throw new Error("NESTED_LEGACY_WRITE_FORBIDDEN")
          },
        },
      },
    } as never,
    {
      issuer: url,
      codexApiEndpoint: `${url}/model`,
    },
  )
  const loaded = await hooks.auth!.loader!(async () => (await getAuth()) as never, {} as never)
  if (mode === "logout")
    await Effect.runPromise(Effect.flatMap(Auth.Service, (auth) => auth.remove("openai")).pipe(Effect.provide(layer)))
  const controller = new AbortController()
  if (mode === "abort-request") controller.abort()
  if (mode === "abort-refresh") setTimeout(() => controller.abort(), 50)
  const response =
    mode === "abort-request"
      ? await loaded.fetch!(new Request(`${url}/v1/responses`, { signal: controller.signal }))
      : await loaded.fetch!(`${url}/v1/responses`, { signal: controller.signal })
  if (!response.ok) throw new Error("FAKE_MODEL_FAILED")
  process.stdout.write("OK\n")
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "FAILED"}\n`)
  process.exitCode = 1
}
