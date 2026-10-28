import { ManagedRuntime } from "effect"
import { TestLLMServer } from "../lib/llm-server"
import { expect, test } from "bun:test"
import { chmod, mkdir, open, readdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { standaloneFixture, invoke } from "../fixture/standalone"
import { testProviderConfig } from "../lib/test-provider"

test.each(["missing", "directory", "denied"])(
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
    }
    if (mode === "directory") await mkdir(path)
    if (mode === "denied") {
      await writeFile(path, "private")
      await chmod(path, 0)
    }
    try {
      const result = await invoke(fixture, ["--file", path, "--", "Загрузи файл в Loginom"])
      const output = result.errors + JSON.stringify(result.events)
      expect(result.exit).toBe(1)
      expect(output).toContain(codes[mode as keyof typeof codes])
      expect(output).not.toContain("LOGINOM_HOST_REQUEST_FAILED")
      expect(result.events.every((event) => event.type === "error")).toBe(true)
      expect(await readdir(fixture.profile)).not.toContain(".writer")
      expect(await readdir(join(fixture.profile, "loginom"))).not.toContain("runtime")
    } finally {
      if (mode === "denied") await chmod(path, 0o600)
    }
  },
  30_000,
)

test("standalone --file over 10 MiB sends a durable reference without a snapshot or browser work", async () => {
  await using fixture = await standaloneFixture()
  const provider = ManagedRuntime.make(TestLLMServer.layer)
  try {
    const llm = await provider.runPromise(TestLLMServer)
    await provider.runPromise(llm.text("Сначала нужен профиль файла."))
    await writeFile(join(fixture.profile, "config/loginom-ai-agent.json"), JSON.stringify(testProviderConfig(llm.url)))
    const path = join(fixture.directory, "данные %#.csv")
    const handle = await open(path, "w")
    await handle.truncate(10 * 1024 ** 2 + 1)
    await handle.close()
    const result = await invoke(fixture, ["--file", path, "--", "Исследуй продажи"])
    expect(result).toMatchObject({ exit: 0 })
    const inputs = JSON.stringify(await provider.runPromise(llm.inputs))
    expect(inputs).toContain("Attached local data reference")
    expect(inputs).toContain(path)
    expect(inputs).not.toContain("snapshot saved")
    expect(inputs).not.toContain("data:text")
    expect(await readdir(fixture.profile)).not.toContain(".writer")
    expect(await readdir(join(fixture.profile, "loginom"))).not.toContain("runtime")
  } finally {
    await provider.dispose()
  }
}, 30_000)
