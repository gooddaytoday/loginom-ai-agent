// B6.2c step 8: one task of the product CLI from the ZIP on a stub model. The stub is an OpenAI-compatible chat endpoint on 127.0.0.1 in this
// process; the CLI profile config names it as the only provider, so a request that reaches it is not a call of a real model.
//   node b62c-task.mjs --cli <loginom-ai-agent-cli.exe> --profile <new directory> --work <directory> [--home <HOME for the child>]
// Prints the exit code, the CLI output and the number of requests the stub received (the model-call counter).
import fs from "node:fs"
import http from "node:http"
import path from "node:path"

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .flatMap((value, index, all) => (value.startsWith("--") ? [[value.slice(2), all[index + 1]]] : [])),
)
const KEY = "b62c-made-up-provider-key"
const seen = { requests: 0, keyOk: 0, paths: [] }
const server = http.createServer((request, response) => {
  let body = ""
  request.on("data", (chunk) => (body += chunk))
  request.on("end", () => {
    seen.requests++
    seen.paths.push(request.url)
    if (request.headers.authorization === `Bearer ${KEY}`) seen.keyOk++
    if (!request.url.endsWith("/chat/completions")) return response.writeHead(404).end("not found")
    const chunk = (value) => `data: ${JSON.stringify(value)}\n\n`
    const base = { id: "stub", object: "chat.completion.chunk", created: 0, model: "b62-model" }
    response.writeHead(200, { "content-type": "text/event-stream" })
    response.end(
      [
        chunk({
          ...base,
          choices: [{ index: 0, delta: { role: "assistant", content: "B62C-STUB-ANSWER" }, finish_reason: null }],
        }),
        chunk({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }),
        chunk({ ...base, choices: [], usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 } }),
        "data: [DONE]\n\n",
      ].join(""),
    )
  })
})
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
const url = `http://127.0.0.1:${server.address().port}/v1`
const profile = path.resolve(args.profile)
fs.mkdirSync(path.join(profile, "config"), { recursive: true })
fs.writeFileSync(
  path.join(profile, "config", "loginom-ai-agent.json"),
  JSON.stringify({
    formatter: false,
    lsp: false,
    provider: {
      b62stub: {
        name: "b62stub",
        npm: "@ai-sdk/openai-compatible",
        options: { apiKey: KEY, baseURL: url },
        models: { "b62-model": { name: "B62 model", tool_call: true, limit: { context: 100000, output: 10000 } } },
      },
    },
  }),
)
fs.mkdirSync(args.work, { recursive: true })
console.log(`stub ${url}; profile ${profile}`)
const started = Date.now()
const { spawn } = await import("node:child_process")
const child = spawn(args.cli, ["run", "--model", "b62stub/b62-model", "Say the word ping."], {
  cwd: args.work,
  env: { ...process.env, LOGINOM_AI_AGENT_CLI_PROFILE: profile, PWD: args.work },
  stdio: ["ignore", "pipe", "pipe"],
})
const out = { stdout: "", stderr: "" }
child.stdout.on("data", (chunk) => (out.stdout += chunk))
child.stderr.on("data", (chunk) => (out.stderr += chunk))
const timer = setTimeout(() => child.kill(), 180_000)
const code = await new Promise((resolve) => child.on("exit", resolve))
clearTimeout(timer)
console.log(
  JSON.stringify({
    code,
    seconds: (Date.now() - started) / 1000,
    stdout: out.stdout.slice(0, 2000),
    stderr: out.stderr
      .replace(/#< CLIXML\r?\n/g, "")
      .replace(/<Objs[\s\S]*?<\/Objs>/g, "[PowerShell progress block]")
      .slice(0, 2000),
    stub: seen,
  }),
)
// no process.exit(): on Windows it can drop the JSON above from a pipe
server.close()
process.exitCode = code === 0 && seen.requests > 0 && seen.keyOk === seen.requests ? 0 : 1
