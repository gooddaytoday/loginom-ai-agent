import { execFile } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

// Probe only declared opt-in contracts. Legacy candidates keep their serial
// launcher and must not be started with an option they do not understand.
export async function verifyCliCapabilities(binary: string, expected: readonly string[] = []) {
  if (!expected.includes("shared-oauth-v1")) return
  const directory = await mkdtemp(join(tmpdir(), "cli-capability-check-"))
  try {
    const result = await promisify(execFile)(binary, ["--capabilities"], {
      cwd: directory,
      env: {
        PATH: "/usr/bin:/bin",
        HOME: directory,
        XDG_CONFIG_HOME: join(directory, "config"),
        XDG_DATA_HOME: join(directory, "data"),
        XDG_STATE_HOME: join(directory, "state"),
        XDG_CACHE_HOME: join(directory, "cache"),
        LOGINOM_AI_AGENT_CLI_PROFILE: join(directory, "profile"),
      },
      timeout: 10_000,
      maxBuffer: 64 * 1024,
      encoding: "utf8",
    })
    const value: unknown = JSON.parse(result.stdout)
    if (
      !value ||
      typeof value !== "object" ||
      !("capabilities" in value) ||
      !Array.isArray(value.capabilities) ||
      value.capabilities.some((item) => typeof item !== "string") ||
      JSON.stringify([...value.capabilities].sort()) !== JSON.stringify([...expected].sort())
    )
      throw new Error("LOGINOM_CANDIDATE_CAPABILITIES_MISMATCH")
  } catch {
    // A failed probe must never expose inherited credentials or child output.
    throw new Error("LOGINOM_CANDIDATE_CAPABILITIES_MISMATCH")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
