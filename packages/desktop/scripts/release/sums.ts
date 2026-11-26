import { readdir, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { decodeManifest, fileHash } from "./manifest"

// B5.2b: the final step of loginom-release.yml. Every file the three platform manifests list must be in the directory
// with exactly the hash the manifest holds; SHA256SUMS.txt then covers the whole candidate. The tag step of stage G
// publishes these bytes, so nothing is hashed twice from two sources.
export async function writeSums(directory: string) {
  const names = (await readdir(directory)).filter((name) => name !== "SHA256SUMS.txt").sort()
  const manifests = await Promise.all(
    ["release-manifest.json", "windows-release-manifest.json", "macos-release-manifest.json"].map(async (name) => {
      if (!names.includes(name)) throw Error(`Required release manifest missing: ${name}`)
      return decodeManifest(await Bun.file(join(directory, name)).json())
    }),
  )
  if (new Set(manifests.map((item) => item.source.commit)).size !== 1 || new Set(manifests.map((item) => item.version)).size !== 1)
    throw Error("Release provenance mismatch: manifests describe different commits or versions")
  for (const artifact of manifests.flatMap((item) => item.artifacts)) {
    if (!names.includes(artifact.file)) throw Error(`Release artifact missing: ${artifact.file}`)
    if ((await fileHash(join(directory, artifact.file))) !== artifact.sha256)
      throw Error(`Release artifact mismatch: ${artifact.file}`)
  }
  const lines = await Promise.all(names.map(async (name) => `${await fileHash(join(directory, name))}  ${name}\n`))
  await writeFile(join(directory, "SHA256SUMS.txt"), lines.join(""))
  return names.length
}

if (import.meta.main) {
  const directory = process.argv[2]
  if (!directory) throw Error("Required: <directory with the collected release files>")
  console.log(`SHA256SUMS.txt covers ${await writeSums(resolve(directory))} files`)
}
