import { expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { delimiter, dirname, join } from "node:path"
import { discoverProductCli, productCliInstallScript } from "./product-cli"

test.skipIf(process.platform !== "linux" || process.arch !== "x64")(
  "installs the complete archive and preserves the active CLI when a later archive fails verification",
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
      await writeFile(join(payload, "resources/loginom/skill"), "Loginom")
      execFileSync("tar", ["-czf", archive, "-C", payload, "."], { env })

      const digest = createHash("sha256")
        .update(await readFile(archive))
        .digest("hex")

      const shell = (script: string) => execFileSync("sh", ["-c", script], { env, encoding: "utf8" })

      shell(productCliInstallScript(archive, digest, "2.3.0"))
      const managed = shell(discoverProductCli()).trim()
      expect(execFileSync(managed, ["--version"], { env, encoding: "utf8" }).trim()).toBe("2.3.0")
      expect(await readFile(join(dirname(managed), "../resources/loginom/skill"), "utf8")).toBe("Loginom")

      await writeFile(archive, "different bytes")
      expect(() => shell(productCliInstallScript(archive, digest, "2.3.0"))).toThrow()
      expect(shell(discoverProductCli()).trim()).toBe(managed)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
)
