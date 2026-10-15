import { standalone } from "./cli/standalone"

await standalone(process.argv.slice(2), async (args, paths) => {
  if (["providers", "auth", "models"].includes(args[0] ?? "")) {
    const { standaloneModels } = await import("./cli/standalone-models")
    await standaloneModels(args)
    return
  }
  const command = args.filter((value) => !["--headless", "--no-headless"].includes(value))[0]
  if (command !== "loginom") {
    const { standaloneRun } = await import("./cli/standalone-run")
    await standaloneRun(args, paths, command === "run" ? "run" : "tui")
    return
  }
  const { standaloneCommand } = await import("./cli/standalone-command")
  try {
    await standaloneCommand(args, paths)
  } catch (error) {
    if (
      !(error instanceof TypeError) ||
      !("code" in error) ||
      typeof error.code !== "string" ||
      !error.code.startsWith("ERR_PARSE_ARGS_")
    )
      throw error
    process.stderr.write("CLI_ARGUMENT_INVALID\n")
    process.exitCode = 2
  }
})
  .catch((error: unknown) => {
    const code =
      error instanceof Error && /^(PROFILE|LOGINOM)_[A-Z_]+$/.test(error.message) ? error.message : "CLI_START_FAILED"
    process.stderr.write(`${code}\n`)
    process.exitCode = code === "PROFILE_BUSY" ? 3 : 1
  })
  .then(async () => {
    // Failed cleanup retains the profile guard; both outcomes still need a bounded CLI exit.
    // Provider libraries may retain process-global handles after a finished request.
    await Promise.all([
      new Promise<void>((resolve) => process.stdout.write("", () => resolve())),
      new Promise<void>((resolve) => process.stderr.write("", () => resolve())),
    ])
    process.exit(process.exitCode ?? 0)
  })
