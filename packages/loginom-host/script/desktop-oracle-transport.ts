import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { oracleProvider, oraclePrompt } from "./oracle-provider"

export async function desktopOracleTransport(options: {
  executable: string
  node: string
  directory: string
  csv: string
  connection: { apiKey: string; password: string; username: string; url: string }
}) {
  await mkdir(options.directory, { recursive: true, mode: 0o700 })
  const provider = oracleProvider({ directory: options.directory, apiKey: options.connection.apiKey })
  const child = Bun.spawn([options.node, join(import.meta.dir, "../../desktop/test/loginom/desktop-oracle.mjs")], {
    stdin: new Blob([JSON.stringify({ ...options, config: provider.config, prompt: oraclePrompt })]),
    stdout: "pipe",
    stderr: "pipe",
  })
  const stdout = new Response(child.stdout).text()
  const stderr = new Response(child.stderr).text()
  void child.exited.then(() => provider.exited())
  return {
    request: provider.request,
    async close() {
      provider.finish()
      try {
        const code = await child.exited
        const output = await stdout
        const errors = await stderr
        if (output.includes(options.connection.apiKey) || errors.includes(options.connection.apiKey))
          throw Error("SECRET_IN_DESKTOP_RESULT")
        await Bun.write(join(options.directory, "stdout.txt"), output)
        await Bun.write(join(options.directory, "stderr.txt"), errors)
        await Bun.write(join(options.directory, "exit.json"), JSON.stringify({ code }))
        if (code !== 0) throw Error(`DESKTOP_ORACLE_EXIT_${code}`)
      } finally {
        provider.stop()
      }
    },
  }
}
