import { parseArgs } from "node:util"
import { launchNodeHost } from "@loginom-ai-agent/loginom-host/node-client"
import type { cliProfile } from "@loginom-ai-agent/product/cli-profile"
import { hostError } from "@loginom-ai-agent/loginom-host/errors"
import { loginomManagement } from "./loginom-management"
import { standaloneBundle } from "./standalone-bundle"

export async function standaloneCommand(args: string[], paths: ReturnType<typeof cliProfile>) {
  const parsed = parseManagementArgs(args)
  if (!parsed) {
    process.exitCode = 2
    process.stderr.write("CLI_ARGUMENT_INVALID\n")
    return
  }
  const format = parsed.values.format
  function failure(value: unknown) {
    const message = value instanceof Error ? value.message : value
    const local = [
      "CLI_ARGUMENT_INVALID",
      "CLI_SETUP_INVALID",
      "CLI_SETUP_TOO_LARGE",
      "CLI_STDIN_REQUIRED",
      "CLI_CANCELLED",
      "LOGINOM_CONFIG_REQUIRED",
      "LOGINOM_RECOVERY_CONFIRMATION_REQUIRED",
      "LOGINOM_BUNDLE_REQUIRED",
      "LOGINOM_BUNDLE_INCOMPLETE",
    ]
    const code = typeof message === "string" && local.includes(message) ? message : hostError(value)
    process.exitCode =
      code === "CLI_CANCELLED"
        ? 130
        : ["LOGINOM_RECOVERY_REQUIRED", "LOGINOM_CALL_UNCERTAIN", "LOGINOM_RECOVERY_CONFIRMATION_REQUIRED"].includes(
              code,
            )
          ? 4
          : [
                "LOGINOM_REVISION_CONFLICT",
                "LOGINOM_APPLICATION_PENDING",
                "LOGINOM_APPLICATION_COMMITTING",
                "LOGINOM_RECOVERY_BUSY",
                "LOGINOM_RECOVERY_CONFLICT",
              ].includes(code)
            ? 3
            : [
                  "CLI_ARGUMENT_INVALID",
                  "CLI_SETUP_INVALID",
                  "CLI_SETUP_TOO_LARGE",
                  "CLI_STDIN_REQUIRED",
                  "LOGINOM_CONFIG_REQUIRED",
                  "LOGINOM_API_KEY_REQUIRED",
                  "LOGINOM_CANDIDATE_INVALID",
                  "LOGINOM_URL_INVALID",
                  "LOGINOM_USERNAME_INVALID",
                  "LOGINOM_BUNDLE_REQUIRED",
                ].includes(code)
              ? 2
              : 1
    if (format === "json") process.stdout.write(JSON.stringify({ ok: false, code }) + "\n")
    process.stderr.write(code + "\n")
  }
  if (
    !["default", "json"].includes(parsed.values.format) ||
    parsed.positionals[0] !== "loginom" ||
    !["status", "setup", "check", "cancel-pending", "recover"].includes(parsed.positionals[1] ?? "") ||
    (parsed.positionals.length > 2 && (parsed.positionals[1] !== "recover" || !parsed.values.acknowledge)) ||
    (parsed.values["stdin-json"] && parsed.positionals[1] !== "setup") ||
    (parsed.values.acknowledge && parsed.positionals[1] !== "recover") ||
    (parsed.values.headless && parsed.values["no-headless"])
  ) {
    failure("CLI_ARGUMENT_INVALID")
    return
  }
  const bundle = await standaloneBundle().catch((error) => { failure(error); return undefined })
  if (!bundle) return
  const host = await launchNodeHost({
    node: bundle.node,
    entry: bundle.entry,
    root: paths.loginom,
    resources: bundle.resources,
    headless: parsed.values.headless && !parsed.values["no-headless"],
    environment: process.env,
    strictRecovery: process.env.LOGINOM_AI_AGENT_STRICT_RECOVERY === "1",
  })
  try {
    const result = await loginomManagement(host, parsed.positionals[1], {
      stdinJSON: parsed.values["stdin-json"],
      acknowledge: parsed.values.acknowledge,
      ids: parsed.positionals.slice(2),
    })
    process.stdout.write(JSON.stringify(result, null, parsed.values.format === "json" ? undefined : 2) + "\n")
  } catch (error) {
    failure(error)
  } finally {
    await host.close()
  }
}

function parseManagementArgs(args: string[]) {
  try {
    return parseArgs({
      args,
      allowPositionals: true,
      options: {
        format: { type: "string", default: "default" },
        headless: { type: "boolean", default: false },
        "no-headless": { type: "boolean", default: false },
        "stdin-json": { type: "boolean", default: false },
        acknowledge: { type: "boolean", default: false },
      },
    })
  } catch {
    return undefined
  }
}
