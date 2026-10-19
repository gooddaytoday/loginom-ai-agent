import { chmod, mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

export function verifyChecksum(data: Uint8Array, manifest: string, filename: string) {
  const expected = manifest
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .find((entry) => entry[1] === filename)?.[0]
  if (!expected || new Bun.CryptoHasher("sha256").update(data).digest("hex") !== expected)
    throw new Error("Gitleaks archive checksum mismatch")
}

async function main() {
  const version = (await Bun.file(new URL("../../../.gitleaks-version", import.meta.url)).text()).trim()
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Invalid Gitleaks version")
  const platform =
    process.platform === "win32"
      ? "windows"
      : ["linux", "darwin"].includes(process.platform)
        ? process.platform
        : undefined
  const arch = ["x64", "arm64"].includes(process.arch) ? process.arch : undefined
  if (!platform || !arch) throw new Error("Unsupported Gitleaks platform")
  const filename = `gitleaks_${version}_${platform}_${arch}.${platform === "windows" ? "zip" : "tar.gz"}`
  const url = `https://github.com/gitleaks/gitleaks/releases/download/v${version}`
  const responses = await Promise.all([fetch(`${url}/${filename}`), fetch(`${url}/gitleaks_${version}_checksums.txt`)])
  if (responses.some((response) => !response.ok)) throw new Error("Official Gitleaks download failed")
  const data = new Uint8Array(await responses[0].arrayBuffer())
  verifyChecksum(data, await responses[1].text(), filename)
  const executable = platform === "windows" ? "gitleaks.exe" : "gitleaks"
  const binary =
    platform === "windows"
      ? await readZip(data, executable)
      : await (await new Bun.Archive(Bun.gunzipSync(data)).files()).get(executable)?.arrayBuffer()
  if (!binary) throw new Error("Gitleaks executable missing from official archive")
  const directory = process.env.GITLEAKS_INSTALL_DIR || join(homedir(), ".local", "bin")
  await mkdir(directory, { recursive: true })
  const target = join(directory, executable)
  await Bun.write(target, binary)
  await chmod(target, 0o755)
  if (Bun.spawnSync([target, "version"]).stdout.toString().trim() !== version)
    throw new Error("Installed Gitleaks version mismatch")
  console.log(`Gitleaks ${version} installed with verified checksum. Add ${directory} to PATH.`)
}

async function readZip(data: Uint8Array, name: string) {
  const { ZipReader, Uint8ArrayReader, Uint8ArrayWriter } = await import("@zip.js/zip.js")
  const reader = new ZipReader(new Uint8ArrayReader(data), { useWebWorkers: false })
  try {
    const entry = (await reader.getEntries()).find((entry) => entry.filename === name)
    return entry && !entry.directory
      ? await entry.getData?.(new Uint8ArrayWriter(), { checkSignature: true })
      : undefined
  } finally {
    await reader.close()
  }
}

if (import.meta.main)
  main().catch(() => {
    console.error(
      "Gitleaks installation failed: check platform, official download and checksum. Hooks never install tools automatically.",
    )
    process.exitCode = 1
  })
