import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { constants, copyFile, mkdir, rm, stat } from "node:fs/promises"
import { isAbsolute, join } from "node:path"
import source from "../licenses/bun/webkit-source.json"
import bun from "../licenses/bun/source.json"
import native from "../licenses/bun/native/sources.json"

// Keep the large source archive separate from the installed executable payload.
const input = process.argv[2]
const destination = process.argv[3]
if (!input || !destination || !isAbsolute(input) || !isAbsolute(destination))
  throw Error("Provide absolute source archive and new companion directory paths")
if (source.bunCommit !== bun.commit || source.commit !== native.components.webkit.commit)
  throw Error("LOGINOM_WEBKIT_SOURCE_REVISION_MISMATCH")
await verify(input)
// Exclusive creation protects existing distributions, even when empty.
await mkdir(destination)
try {
  const archive = join(destination, source.file)
  await copyFile(input, archive, constants.COPYFILE_EXCL)
  // Verify the delivered bytes, including changes to the input during copying.
  await verify(archive)
  await Bun.write(join(destination, "source.json"), JSON.stringify(source, null, 2) + "\n")
  await Bun.write(join(destination, "SHA256SUMS"), `${source.sha256}  ${source.file}\n`)
  await Bun.write(
    join(destination, "README.md"),
    "# WebKit source companion\n\n" +
      `Complete WebKit source for Bun ${bun.version} (${bun.commit}).\n\n` +
      "Distribute this directory alongside the CLI archive. Verify with `sha256sum -c SHA256SUMS`. " +
      "The archive preserves original source and notices, including internal symlinks. " +
      "source.json records the exact revision and archive generation. " +
      "This is one component of the corresponding source distribution; other dependencies and " +
      "rebuild/relinking verification remain separate. It is not a release compliance approval.\n",
  )
  console.log(JSON.stringify({ destination, sha256: source.sha256, bytes: source.bytes, status: "PASS" }))
} catch (error) {
  await rm(destination, { recursive: true, force: true })
  throw error
}

async function verify(path: string) {
  if ((await stat(path)).size !== source.bytes) throw Error("LOGINOM_WEBKIT_SOURCE_SIZE_MISMATCH")
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  if (hash.digest("hex") !== source.sha256) throw Error("LOGINOM_WEBKIT_SOURCE_HASH_MISMATCH")
}
