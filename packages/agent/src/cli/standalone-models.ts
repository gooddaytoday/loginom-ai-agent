import { standaloneCancellation } from "./standalone-cancellation"
import { Product } from "@loginom-ai-agent/product"

// Model credentials belong to the guarded CLI profile and do not require Loginom.
export async function standaloneModels(args: string[]) {
  process.env.LOGINOM_AI_AGENT_DISABLE_AUTOUPDATE = "1"
  process.env.LOGINOM_AI_AGENT_DISABLE_MODELS_FETCH = "1"
  const { applyCliSystemProxy } = await import("./standalone-proxy")
  await applyCliSystemProxy()
  const { AppRuntime } = await import("../effect/app-runtime")
  try {
    if (standaloneCancellation()?.aborted) throw new Error("CLI_CANCELLED")
    const { ProvidersCommand } = await import("./cmd/providers")
    const { ModelsCommand } = await import("./cmd/models")
    const { default: yargs } = await import("yargs")
    await yargs()
      .scriptName(Product.cliExecutable)
      .exitProcess(false)
      .help(false)
      .version(false)
      .command(ProvidersCommand)
      .command(ModelsCommand)
      .strict()
      .fail((_message, error) => {
        throw error ?? new Error("CLI_ARGUMENT_INVALID")
      })
      .parseAsync(args)
  } catch (error) {
    const cancelled = standaloneCancellation()?.aborted
    const invalid = error instanceof Error && error.message === "CLI_ARGUMENT_INVALID"
    process.stderr.write(
      (cancelled ? "CLI_CANCELLED" : invalid ? "CLI_ARGUMENT_INVALID" : "CLI_MODEL_COMMAND_FAILED") + "\n",
    )
    process.exitCode = cancelled ? 130 : invalid ? 2 : 1
  } finally {
    await AppRuntime.dispose()
    if (standaloneCancellation()?.aborted) process.exitCode = 130
  }
}
