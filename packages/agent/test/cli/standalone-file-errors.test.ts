import { expect, test } from "bun:test"
import { chmod, mkdir, open, readdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { standaloneFixture, invoke } from "../fixture/standalone"
import { testProviderConfig } from "../lib/test-provider"

test.each(["missing", "directory", "denied", "oversize"])(
  "standalone --file reports the admission cause before model/browser work: %s",
  async (mode) => {
    await using fixture = await standaloneFixture()
    await writeFile(
      join(fixture.profile, "config/loginom-ai-agent.json"),
      JSON.stringify(testProviderConfig("http://127.0.0.1:1/v1")),
    )
    const path = join(fixture.directory, "input.csv")
    const codes = {
      missing: "LOGINOM_FILE_NOT_FOUND",
      directory: "LOGINOM_FILE_NOT_REGULAR",
      denied: "LOGINOM_FILE_ACCESS_DENIED",
      oversize: "LOGINOM_FILE_TOO_LARGE",
    }
    if (mode === "directory") await mkdir(path)
    if (mode === "denied") {
      await writeFile(path, "private")
      await chmod(path, 0)
    }
    if (mode === "oversize") {
      const file = await open(path, "w")
      try {
        await file.truncate(10 * 1024 * 1024 + 1)
      } finally {
        await file.close()
      }
    }
    try {
      const result = await invoke(fixture, ["--file", path, "--", "Загрузи файл в Loginom"])
      const output = result.errors + JSON.stringify(result.events)
      expect(result.exit).toBe(1)
      expect(output).toContain(codes[mode as keyof typeof codes])
      expect(output).not.toContain("LOGINOM_HOST_REQUEST_FAILED")
      expect(result.events.every((event) => event.type === "error")).toBe(true)
      if (mode === "oversize") {
        expect(output).toContain("10485761")
        expect(output).toContain("10485760")
        expect(output).toContain("профиль и выборка")
      }
      expect(await readdir(fixture.profile)).not.toContain(".writer")
      expect(await readdir(join(fixture.profile, "loginom"))).not.toContain("runtime")
    } finally {
      if (mode === "denied") await chmod(path, 0o600)
    }
  },
  30_000,
)
