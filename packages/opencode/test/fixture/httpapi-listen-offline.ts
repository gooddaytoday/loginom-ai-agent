import path from "node:path"

const proxy = "http://127.0.0.1:1"
const bypass = "localhost,127.0.0.1,::1"
const child = Bun.spawn(
  [
    process.execPath,
    "test",
    "--timeout",
    "30000",
    "--test-name-pattern",
    "default in-process handler does not emit Effect HTTP response logs",
    "./test/server/httpapi-listen.test.ts",
  ],
  {
    cwd: path.resolve(import.meta.dir, "../.."),
    env: {
      ...process.env,
      HTTPS_PROXY: proxy,
      https_proxy: proxy,
      HTTP_PROXY: proxy,
      http_proxy: proxy,
      ALL_PROXY: proxy,
      all_proxy: proxy,
      NO_PROXY: bypass,
      no_proxy: bypass,
      LOGINOM_AI_AGENT_PRINT_LOGS: "1",
    },
    stdout: "inherit",
    stderr: "inherit",
  },
)

process.exit(await child.exited)
