import { expect, test } from "bun:test"
import { execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtemp, mkdir, readFile, readlink, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, delimiter, dirname, join } from "node:path"
import { discoverProductCli, installProductCli, productCliInstallScript } from "./wsl-install"

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
      const pack = async () => {
        execFileSync("tar", ["-czf", archive, "--owner=1234", "--group=1234", "-C", payload, "."], { env })
        return createHash("sha256").update(await readFile(archive)).digest("hex")
      }
      const install = async (skill: string) => {
        await writeFile(join(payload, "resources/loginom/skill"), skill)
        const digest = await pack()
        shell(productCliInstallScript(archive, digest, "2.3.0"))
        return digest
      }
      const base = join(home, ".local/share/loginom-ai-agent-wsl")
      const releases = async () => (await readdir(base)).filter((name) => /^[0-9a-f]{64}(?:\.[a-zA-Z0-9]{8})?$/.test(name)).sort()

      await install("Loginom")
      const managed = shell(discoverProductCli()).trim()
      expect(execFileSync(managed, ["--version"], { env, encoding: "utf8" }).trim()).toBe("2.3.0")
      expect(await readFile(join(dirname(managed), "../resources/loginom/skill"), "utf8")).toBe("Loginom")

      await mkdir(join(base, "unmanaged"))
      const previous = await install("Updated Loginom")
      const current = await install("Latest Loginom")
      expect(await releases()).toEqual([previous, current].sort())
      expect(await readdir(base)).toContain("unmanaged")

      const currentLink = join(base, "current")
      shell(productCliInstallScript(archive, current, "2.3.0"))
      expect(await readlink(currentLink)).toBe(join(base, current))
      expect(await releases()).toEqual([previous, current].sort())

      const oldTarget = await readlink(currentLink)
      const resource = join(currentLink, "resources/loginom/skill")
      await rm(resource)
      shell(productCliInstallScript(archive, current, "2.3.0"))
      expect(await readFile(resource, "utf8")).toBe("Latest Loginom")
      const repaired = await readlink(currentLink)
      expect(repaired).not.toBe(oldTarget)
      expect(await releases()).toEqual([previous, basename(repaired)].sort())

      shell(productCliInstallScript(archive, current, "2.3.0"))
      expect(await readlink(currentLink)).toBe(repaired)

      await writeFile(archive, "different bytes")
      expect(() => shell(productCliInstallScript(archive, current, "2.3.0"))).toThrow()

      // A CLI may print the expected version and still report failure.
      await writeFile(join(payload, "bin/loginom-ai-agent-cli"), "#!/bin/sh\necho 2.3.0\nexit 1\n", { mode: 0o755 })
      const broken = await pack()
      const result = spawnSync("sh", ["-c", productCliInstallScript(archive, broken, "2.3.0")], { env })
      expect(result.status).toBe(1)
      expect(await readlink(currentLink)).toBe(repaired)
      expect(await releases()).toEqual([previous, basename(repaired)].sort())
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
    async () => {
      throw Error("Unexpected download")
    },
  )
  await expect(result).rejects.toThrow("error.armUnsupported")
  expect(commands).toEqual(["uname -m"])
})
