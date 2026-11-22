// Writes the global configuration and the provider credentials of a Loginom AI Agent 0.4.x profile for the B3.2 tests
// by calling the API of that release's own backend, the way its Desktop settings did: the custom provider dialog sets
// the key and then the provider (`a080f7725c:packages/app/src/components/dialog-custom-provider.tsx`), the general
// settings set the shell. The model is set through the same API, as a user would in the configuration file.
//   bun generate-settings.ts <fork checkout>
// The checkout is `git worktree add --detach <dir> a080f7725c`, prepared as for generate.ts. The provider key is made up.
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs"
import path from "node:path"
import { recorded } from "./restore"

const [checkout] = process.argv.slice(2)
if (!checkout) throw new Error("usage: bun generate-settings.ts <fork checkout>")
const root = `${recorded}-settings`
rmSync(root, { recursive: true, force: true })
const env = {
  PATH: process.env.PATH,
  HOME: path.join(root, "home"),
  XDG_DATA_HOME: path.join(root, "data"),
  XDG_CONFIG_HOME: path.join(root, "config"),
  XDG_STATE_HOME: path.join(root, "state"),
  XDG_CACHE_HOME: path.join(root, "cache"),
  TMPDIR: path.join(root, "tmp"),
  LOGINOM_AI_AGENT_CHANNEL: "prod",
  LOGINOM_AI_AGENT_DISABLE_MODELS_FETCH: "1",
  LOGINOM_AI_AGENT_DISABLE_AUTOUPDATE: "1",
  LOGINOM_AI_AGENT_SERVER_USERNAME: "fixture",
  LOGINOM_AI_AGENT_SERVER_PASSWORD: "fixture",
}
mkdirSync(env.TMPDIR, { recursive: true })
mkdirSync(env.HOME, { recursive: true })

const port = 47000 + Math.floor(Math.random() * 1000)
const base = `http://127.0.0.1:${port}`
const server = Bun.spawn(["bun", "run", "src/index.ts", "serve", "--port", String(port), "--hostname", "127.0.0.1"], {
  cwd: path.join(checkout, "packages", "opencode"),
  env,
  stdout: "pipe",
  stderr: "pipe",
})
const call = async (method: string, route: string, body: unknown) => {
  const response = await fetch(base + route, {
    method,
    headers: {
      authorization: `Basic ${btoa("fixture:fixture")}`,
      "content-type": "application/json",
      "x-opencode-directory": env.HOME,
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${method} ${route}: ${response.status} ${await response.text()}`)
}
try {
  for (let i = 0; i < 150; i++) {
    if (
      await fetch(base).then(
        () => true,
        () => false,
      )
    )
      break
    await Bun.sleep(200)
  }
  await call("PUT", "/auth/stub", { type: "api", key: "fixture-provider-key" })
  await call("PATCH", "/global/config", {
    provider: {
      stub: {
        npm: "@ai-sdk/openai-compatible",
        name: "Stub provider",
        options: { baseURL: "http://127.0.0.1:4010/v1" },
        models: { "stub-model": { name: "Stub model" } },
      },
    },
    disabled_providers: [],
  })
  await call("PATCH", "/global/config", { shell: "/bin/bash" })
  await call("PATCH", "/global/config", { model: "stub/stub-model" })
} finally {
  server.kill()
  await server.exited
}

const files = {
  "0.4-config.jsonc": path.join(root, "config", "loginom-ai-agent", "loginom-ai-agent.jsonc"),
  "0.4-auth.json": path.join(root, "data", "loginom-ai-agent", "auth.json"),
}
Object.entries(files).forEach(([name, file]) => {
  if (!existsSync(file)) throw new Error(`0.4 did not write ${file}`)
  copyFileSync(file, path.join(import.meta.dir, name))
})
