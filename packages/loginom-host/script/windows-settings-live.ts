import { join } from "node:path"

if (import.meta.main) {
  if (process.platform !== "win32") throw Error("WINDOWS_ONLY_TEST")
  const config = await settingsLiveConfig(process.env)
  const child = Bun.spawn(config.command, {
    stdin: new Blob([JSON.stringify(config.input)]),
    stdout: "pipe",
    stderr: "pipe",
  })
  const output = new Response(child.stdout).text()
  const errors = new Response(child.stderr).text()
  const code = await child.exited
  const stdout = await output
  const stderr = await errors
  if (code !== 0) {
    console.error(stderr)
    throw Error(`SETTINGS_LIVE_FAILED_${code}`)
  }
  console.log(stdout.trim())
}

export async function settingsLiveConfig(environment: NodeJS.ProcessEnv) {
  const executable = environment.LOGINOM_AI_AGENT_TEST_DESKTOP_EXECUTABLE
  const resources = environment.LOGINOM_AI_AGENT_TEST_RESOURCES
  const credentialProfile = environment.LOGINOM_AI_AGENT_TEST_CREDENTIAL_PROFILE
  if (!executable || !resources || !credentialProfile) throw Error("INSTALLED_DESKTOP_INPUTS_REQUIRED")
  const fixture = environment.LOGINOM_AI_AGENT_TEST_CLOUD_FIXTURE
  if (!fixture) throw Error("CLOUD_FIXTURE_REQUIRED_MATCHING_COMPILED_DEV_ENDPOINTS")
  const record = await Bun.file(join(credentialProfile, "loginom/connection/connection.json")).json()
  const cloud = await Bun.file(fixture).json()
  return {
    command: [join(resources, "bin/node.exe"), join(import.meta.dir, "../../desktop/test/loginom/settings-live.mjs")],
    input: { executable, connection: { url: record.url, username: record.username }, cloud },
  }
}
