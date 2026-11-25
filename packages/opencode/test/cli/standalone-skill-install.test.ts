import { expect, test } from "bun:test"
import { ManagedRuntime, Schema } from "effect"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { standaloneFixture, standaloneRun } from "../fixture/standalone"
import { TestLLMServer } from "../lib/llm-server"
import { testProviderConfig } from "../lib/test-provider"

const terminalResult = Schema.decodeUnknownSync(Schema.Struct({
  stdout: Schema.String,
  stderr: Schema.String,
  phrase: Schema.NullOr(Schema.String),
  exit: Schema.Number,
}))

test.skipIf(process.platform !== "linux")("standalone run requires a fresh terminal reply to install a skill even with --auto", async () => {
  await using fixture = await standaloneFixture()
  const provider = ManagedRuntime.make(TestLLMServer.layer)
  try {
    const llm = await provider.runPromise(TestLLMServer)
    const home = join(fixture.directory, "home")
    const source = join(fixture.directory, "columns")
    const resource = "references/schema.md"
    const destination = join(home, ".agents/skills/columns")
    const published = join(destination, resource)
    await Bun.write(join(source, "SKILL.md"),
      "---\nname: columns\ndescription: Checks the required columns.\n---\n[Schema](references/schema.md)")
    await Bun.write(join(source, resource), "sku, amount\n")
    await Bun.write(join(fixture.profile, "config/loginom-ai-agent.json"), JSON.stringify({
      ...testProviderConfig(llm.url),
      permission: { "*": "allow" },
      snapshot: false,
    }))

    const command = standaloneRun(fixture, ["--auto", "--", "Install the local columns skill."], {
      LOGINOM_AI_AGENT_TEST_HOME: home,
      LOGINOM_AI_AGENT_EXPERIMENTAL_DISABLE_FILEWATCHER: "1",
    })

    for (const choice of ["no-tty", "cancel", "confirm"]) {
      await provider.runPromise(llm.reset)
      await provider.runPromise(llm.tool("skill_install", { action: "install", source }))
      await provider.runPromise(llm.text("Finished."))
      const child = Bun.spawn([
        "python3", join(import.meta.dir, "standalone-dashboard-pty.py"), choice, "", ...command.argv,
      ], { ...command, stdout: "pipe", stderr: "inherit" })
      const [raw, exit] = await Promise.all([new Response(child.stdout).json(), child.exited])
      expect(exit, choice).toBe(0)
      const output = terminalResult(raw)
      const confirmed = choice === "confirm"
      expect(output.exit, output.stderr).toBe(confirmed ? 0 : 1)
      if (choice === "no-tty") {
        expect(output.stderr, output.stdout).toContain("требуется управляющий терминал")
      } else {
        expect(output.phrase).toMatch(/^Подтвердить [0-9a-f]{8}$/)
        expect(output.stderr).toContain('Установка скилла "columns"')
        expect(output.stderr).toContain(source)
        expect(output.stderr).toContain(destination)
      }
      if (confirmed) {
        expect(await readFile(published, "utf8")).toBe("sku, amount\n")
      } else {
        await expect(readFile(published, "utf8")).rejects.toMatchObject({ code: "ENOENT" })
      }
    }
  } finally {
    await provider.dispose()
  }
}, 75_000)
