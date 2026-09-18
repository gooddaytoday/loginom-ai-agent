import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { constants, copyFile, mkdir, rm, stat } from "node:fs/promises"
import { isAbsolute, join } from "node:path"
import catalog from "../licenses/bun/source-companion.json"
import bun from "../licenses/bun/source.json"

const input = process.argv[2]
const destination = process.argv[3]
if (!input || !destination || !isAbsolute(input) || !isAbsolute(destination))
  throw Error("Provide absolute input directory and new source companion directory")
if (catalog.bunCommit !== bun.commit) throw Error("LOGINOM_BUN_SOURCE_REVISION_MISMATCH")
// Fail before creating output when a required input is absent or corrupt.
for (const file of catalog.archives) await verify(join(input, file.file), file)
await mkdir(destination)
try {
  for (const file of catalog.archives) {
    const output = join(destination, file.file)
    await copyFile(join(input, file.file), output, constants.COPYFILE_EXCL)
    await verify(output, file)
  }
  await Bun.write(join(destination, "source-companion.json"), JSON.stringify(catalog, null, 2) + "\n")
  await Bun.write(
    join(destination, "SHA256SUMS"),
    catalog.archives.map((file) => `${file.sha256}  ${file.file}\n`).join(""),
  )
  await Bun.write(
    join(destination, "README.md"),
    "# Bun source companion\n\n" +
      `Sources for Bun ${bun.version} (${bun.commit}), used by the standalone CLI. ` +
      "Distribute this directory alongside the CLI and application source archives. " +
      "Run `sha256sum -c SHA256SUMS` before extracting.\n\n" +
      "The complete Bun archive includes its build scripts and dependency patches. " +
      "Other archives preserve upstream source and notices for the pinned direct dependencies, including WebKit. " +
      "Use the build scripts in this exact Bun revision; historical LICENSE commands may be outdated. " +
      "Rust transitive crates and toolchain prerequisites remain separate; this is not yet a verified offline build closure. " +
      "See source-companion.json for coverage and remaining rebuild/relinking checks.\n",
  )
  console.log(JSON.stringify({ destination, archives: catalog.archives.length, status: "PASS" }))
} catch (error) {
  await rm(destination, { recursive: true, force: true })
  throw error
}

async function verify(path: string, expected: { bytes: number; sha256: string }) {
  if ((await stat(path)).size !== expected.bytes) throw Error("LOGINOM_BUN_SOURCE_SIZE_MISMATCH")
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  if (hash.digest("hex") !== expected.sha256) throw Error("LOGINOM_BUN_SOURCE_HASH_MISMATCH")
}
