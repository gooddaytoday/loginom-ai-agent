import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { cliOracleTransport } from "./cli-oracle-transport"
import { desktopOracleTransport } from "./desktop-oracle-transport"
import { cliCredentials } from "../src/connection/cli-credentials"

// Native acceptance: close each independent application while the other has a
// live Loginom workspace, then require a fresh successful observation there.
const configPath = process.env.LOGINOM_AI_AGENT_TEST_CONFIG
const cli = process.env.LOGINOM_AI_AGENT_TEST_CLI_EXECUTABLE
const desktop = process.env.LOGINOM_AI_AGENT_TEST_DESKTOP_EXECUTABLE
const resources = process.env.LOGINOM_AI_AGENT_TEST_RESOURCES
if (!configPath || !cli || !desktop || !resources) throw Error("INDEPENDENCE_INPUTS_REQUIRED")
const config = await Bun.file(configPath).json()
const credentialProfile = process.env.LOGINOM_AI_AGENT_TEST_CREDENTIAL_PROFILE
if (credentialProfile) {
  const record = await Bun.file(join(credentialProfile, "loginom/connection/connection.json")).json()
  const secret = await cliCredentials("win32").decode(record.secrets)
  config.api_key = secret.apiKey
  config.loginom_url = record.url
  config.workflow_profile = { passwordless_login: secret.password === "", loginom_user: record.username }
}
if (config.workflow_profile?.passwordless_login !== true) throw Error("TEST_PASSWORD_UNAVAILABLE")
const directory = await mkdtemp(join(tmpdir(), "loginom-desktop-cli-independence-"))
console.log(`Private acceptance evidence: ${directory}`)
const connection = {
  apiKey: config.api_key,
  password: "",
  url: config.loginom_url,
  username: config.workflow_profile.loginom_user,
}

for (const first of ["desktop", "cli"] as const) {
  const folder = join(directory, `close-${first}`)
  const cliChild = await cliOracleTransport({
    executable: cli,
    directory: join(folder, "cli"),
    csv: "amount\n55\n",
    connection,
  })
  const desktopChild = await desktopOracleTransport({
    executable: desktop,
    node: join(resources, "bin/node"),
    directory: join(folder, "desktop"),
    csv: "amount\n101\n",
    connection,
  }).catch(async (error) => {
    await cliChild.close()
    throw error
  })
  const closed = new Set<string>()
  try {
    for (const child of [cliChild, desktopChild]) {
      const reply = await call(child, "dock_prepare", { intent: "new_draft", operation_id: "prepare" })
      if (!reply.prepared || !reply.workspace?.authenticated) throw Error("PREPARATION_FAILED")
    }
    const stopped = first === "desktop" ? desktopChild : cliChild
    const survivor = first === "desktop" ? cliChild : desktopChild
    await stopped.close()
    closed.add(first)
    const reply = await call(survivor, "dock_workspace_observe", { scope: "roots" })
    if (reply.status !== "SUCCEEDED" || !reply.output?.authenticated) throw Error("SURVIVOR_UNAVAILABLE")
    const result = { status: "PASS", closed: first, survivor: first === "desktop" ? "cli" : "desktop" }
    await Bun.write(join(folder, "summary.json"), JSON.stringify(result, null, 2))
    console.log(JSON.stringify(result))
  } finally {
    const results = await Promise.allSettled(
      (
        [
          ["cli", cliChild],
          ["desktop", desktopChild],
        ] as const
      )
        .filter(([name]) => !closed.has(name))
        .map(([, child]) => child.close()),
    )
    const failed = results.find((result) => result.status === "rejected")
    if (failed?.status === "rejected") throw failed.reason
  }
}

async function call(
  child: Pick<Awaited<ReturnType<typeof cliOracleTransport>>, "request">,
  name: string,
  args: Record<string, unknown>,
) {
  const envelope = await child.request("call", { name, arguments: args })
  if (!envelope || typeof envelope !== "object" || !("result" in envelope)) throw Error("REPLY_INVALID")
  const text = JSON.stringify(envelope.result)
  if (text.includes(connection.apiKey)) throw Error("SECRET_IN_TOOL_RESULT")
  const result = envelope.result as {
    isError?: boolean
    content: { type: string; text?: string }[]
    structuredContent?: Record<string, unknown>
  }
  if (result.isError) throw Error(`TOOL_FAILED_${name}`)
  // Match the established acceptance adapter: both structured and text-only MCP replies.
  return result.structuredContent ?? JSON.parse(result.content.find((item) => item.type === "text")!.text!)
}
