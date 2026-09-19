import { join } from "node:path"
import { cliCredentials } from "../src/connection/cli-credentials"

if (process.platform !== "win32") throw Error("WINDOWS_ONLY_TEST")
const executable = process.env.LOGINOM_AI_AGENT_TEST_DESKTOP_EXECUTABLE
const resources = process.env.LOGINOM_AI_AGENT_TEST_RESOURCES
const credentialProfile = process.env.LOGINOM_AI_AGENT_TEST_CREDENTIAL_PROFILE
if (!executable || !resources || !credentialProfile) throw Error("INSTALLED_DESKTOP_INPUTS_REQUIRED")
const record = await Bun.file(join(credentialProfile, "loginom/connection/connection.json")).json()
const secret = await cliCredentials("win32").decode(record.secrets)
const child = Bun.spawn(
  [join(resources, "bin/node.exe"), join(import.meta.dir, "../../desktop/test/loginom/settings-live.mjs")],
  {
    stdin: new Blob([
      JSON.stringify({
        executable,
        connection: { apiKey: secret.apiKey, password: secret.password, url: record.url, username: record.username },
      }),
    ]),
    stdout: "pipe",
    stderr: "pipe",
  },
)
const output = new Response(child.stdout).text()
const errors = new Response(child.stderr).text()
const code = await child.exited
const stdout = await output
const stderr = await errors
if ([secret.apiKey, secret.password].filter(Boolean).some((value) => stdout.includes(value) || stderr.includes(value)))
  throw Error("SECRET_IN_SETTINGS_TEST_OUTPUT")
if (code !== 0) {
  console.error(stderr)
  throw Error(`SETTINGS_LIVE_FAILED_${code}`)
}
console.log(stdout.trim())
