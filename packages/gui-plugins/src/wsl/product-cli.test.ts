import { expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { delimiter, dirname, join } from "node:path"
import { discoverProductCli, installProductCli, productCliInstallScript } from "./product-cli"

test.skipIf(process.platform !== "linux" || process.arch !== "x64")(
  "installs complete archives, keeps two releases, and preserves them when verification fails",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "wsl-cli-install-"))
    const home = join(root, "WSL home")
    const payload = join(root, "payload")
    const archive = join(root, "CLI's archive.tar.gz")
    const env = { HOME: home, PATH: root + delimiter + process.env.PATH }

    try {
      await mkdir(join(payload, "bin"), { recursive: true })
      await mkdir(join(payload, "resources/loginom"), { recursive: true })
      await writeFile(join(root, "wslpath"), '#!/bin/sh\nprintf "%s\\n" "$2"\n', { mode: 0o755 })
      await writeFile(join(payload, "bin/loginom-ai-agent-cli"), "#!/bin/sh\necho 2.3.0\n", { mode: 0o755 })
      const shell = (script: string) => execFileSync("sh", ["-c", script], { env, encoding: "utf8" })
      const install = async (skill: string) => {
        await writeFile(join(payload, "resources/loginom/skill"), skill)
        execFileSync("tar", ["-czf", archive, "-C", payload, "."], { env })
        const digest = createHash("sha256").update(await readFile(archive)).digest("hex")
        shell(productCliInstallScript(archive, digest, "2.3.0"))
        return digest
      }
      const base = join(home, ".local/share/loginom-ai-agent-wsl")
      const releases = async () => (await readdir(base)).filter((name) => /^[0-9a-f]{64}$/.test(name)).sort()

      await install("Loginom")
      const managed = shell(discoverProductCli()).trim()
      expect(execFileSync(managed, ["--version"], { env, encoding: "utf8" }).trim()).toBe("2.3.0")
      expect(await readFile(join(dirname(managed), "../resources/loginom/skill"), "utf8")).toBe("Loginom")

      await mkdir(join(base, "unmanaged"))
      const previous = await install("Updated Loginom")
      const current = await install("Latest Loginom")
      expect(await releases()).toEqual([previous, current].sort())
      expect(await readdir(base)).toContain("unmanaged")

      shell(productCliInstallScript(archive, current, "2.3.0"))
      expect(await releases()).toEqual([previous, current].sort())

      await writeFile(archive, "different bytes")
      expect(() => shell(productCliInstallScript(archive, current, "2.3.0"))).toThrow()
      expect(await releases()).toEqual([previous, current].sort())
      expect(shell(discoverProductCli()).trim()).toBe(join(base, current, "bin/loginom-ai-agent-cli"))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
)


test.each(["aarch64", "arm64"])("refuses %s before accessing a release feed", async (arch) => {
  const commands: string[] = []
  const result = installProductCli(
    {
      async runWslSh(command) {
        commands.push(command)
        return { code: 0, signal: null, stdout: `${arch}\r\n`, stderr: "" }
      },
    },
    "Ubuntu",
    "2.3.0",
    (key) => key,
    new AbortController().signal,
    () => undefined,
  )
  await expect(result).rejects.toThrow("error.armUnsupported")
  expect(commands).toEqual(["uname -m"])
})
