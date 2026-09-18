// Standalone owns a private host and a profile guard outside the legacy command.
// Let its finally blocks drain resources instead of exiting inside a handler.
export function exitCli(code: number): never {
  if (process.env.LOGINOM_AI_AGENT_CLI_ROOT) {
    process.exitCode = code
    throw new Error("CLI_COMMAND_FAILED")
  }
  process.exit(code)
}
