import { mkdir, readdir } from "node:fs/promises"
import { join } from "node:path"
import { observeBrowserWindows } from "./window-observer"
import { oracleProvider, oraclePrompt } from "./oracle-provider"

// Manual acceptance adapter. The scripted provider drives the real CLI tool path;
// it makes no claim about the quality of a production model.
export async function cliOracleTransport(options: {
  executable: string
  mode?: "run" | "tui"
  headed?: boolean
  directory: string
  profile?: string
  csv?: string
  resume?: { profile: string; workspace: string; session: string; latest?: boolean; prompt: string }
  connection: { apiKey: string; password: string; username: string; url: string }
}) {
  await mkdir(options.directory, { recursive: true, mode: 0o700 })
  if (!options.resume && typeof options.csv !== "string") throw Error("CLI_ORACLE_INPUT_REQUIRED")
  const profile = options.resume?.profile ?? options.profile ?? join(options.directory, "profile")
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("LOGINOM_AI_AGENT_CLI_"))),
    LOGINOM_AI_AGENT_CLI_PROFILE: profile,
    LOGINOM_AI_AGENT_PURE: "1",
  }
  if (!options.resume && !options.profile) {
    const setup = Bun.spawn([options.executable, "loginom", "setup", "--stdin-json", "--format", "json"], {
      env,
      stdin: new Blob([JSON.stringify(options.connection)]),
      stdout: "pipe",
      stderr: "pipe",
    })
    const setupOutput = new Response(setup.stdout).text()
    const setupErrors = new Response(setup.stderr).text()
    const setupCode = await setup.exited
    const setupResult = await setupOutput
    const setupDiagnostics = await setupErrors
    if (setupResult.includes(options.connection.apiKey) || setupDiagnostics.includes(options.connection.apiKey))
      throw Error("SECRET_IN_SETUP_RESULT")
    await Bun.write(join(options.directory, "setup.json"), setupResult)
    await Bun.write(join(options.directory, "setup-stderr.txt"), setupDiagnostics)
    if (setupCode !== 0) throw Error("CLI_ORACLE_SETUP_FAILED")
  }
  const provider = oracleProvider({
    directory: options.directory,
    apiKey: options.connection.apiKey,
    onFinish() {
      if (options.mode === "tui") child.stdin.write("finish\n")
    },
  })
  await Bun.write(join(profile, "config/loginom-ai-agent.json"), JSON.stringify(provider.config))
  const workspace =
    options.resume?.workspace ?? (options.mode === "tui" ? join(options.directory, "workspace") : options.directory)
  await mkdir(workspace, { recursive: true })
  const file = join(workspace, "sales.csv")
  if (!options.resume) await Bun.write(file, options.csv!)
  const finishWindows =
    options.headed || options.resume ? observeBrowserWindows(options.resume?.profile ?? options.directory) : undefined
  const child = Bun.spawn(
    options.mode === "tui"
      ? [
          "python3",
          join(import.meta.dir, "tui-oracle.py"),
          options.executable,
          workspace,
          options.directory,
          options.headed ? "--no-headless" : "--headless",
          JSON.stringify(
            options.resume
              ? { session: options.resume.session, latest: options.resume.latest, prompt: options.resume.prompt }
              : {},
          ),
        ]
      : [
          options.executable,
          "run",
          options.headed ? "--no-headless" : "--headless",
          "--format",
          "json",
          "--dir",
          workspace,
          "--model",
          "test/test-model",
          "--dangerously-skip-permissions",
          ...(options.resume
            ? options.resume.latest
              ? ["--continue"]
              : ["--session", options.resume.session]
            : ["--file", file]),
          "--",
          options.resume?.prompt ?? oraclePrompt,
        ],
    {
      cwd: options.directory,
      env,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  if (options.mode !== "tui") child.stdin.end()
  const stdout = new Response(child.stdout).text()
  const stderr = new Response(child.stderr).text()
  void child.exited.then(() => provider.exited())
  return {
    request: provider.request,
    async close() {
      provider.finish()
      const timer = setTimeout(() => child.kill(options.mode === "tui" ? "SIGTERM" : "SIGKILL"), 30000)
      try {
        const code = await child.exited
        const output = await stdout
        const errors = await stderr
        if (output.includes(options.connection.apiKey) || errors.includes(options.connection.apiKey))
          throw Error("SECRET_IN_CLI_RESULT")
        await Bun.write(join(options.directory, options.mode === "tui" ? "terminal.txt" : "events.jsonl"), output)
        await Bun.write(join(options.directory, "stderr.txt"), errors)
        const guarded = (await readdir(profile)).includes(".writer")
        await Bun.write(join(options.directory, "exit.json"), JSON.stringify({ code, guarded }))
        if (guarded) throw Error("CLI_ORACLE_SHUTDOWN_FAILED")
        if (code !== 0) throw Error(`CLI_ORACLE_EXIT_${code}`)
      } finally {
        clearTimeout(timer)
        provider.stop()
        if (finishWindows) {
          const windows = await finishWindows()
          await Bun.write(join(options.directory, "windows.json"), JSON.stringify(windows))
          if (
            !windows.browserProcesses ||
            windows.remaining.length ||
            (options.headed ? !windows.visible.length : windows.visible.length)
          )
            throw Error("CLI_WINDOW_ACCEPTANCE_FAILED")
        }
      }
    },
  }
}
