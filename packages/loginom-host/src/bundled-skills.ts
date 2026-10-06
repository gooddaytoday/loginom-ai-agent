import { createHash } from "node:crypto"
import { readFile, readdir, realpath, stat } from "node:fs/promises"
import { isAbsolute, join, relative, sep } from "node:path"
import { Option, Schema } from "effect"

const manifest = Schema.Struct({
  protocol: Schema.Literal(1),
  files: Schema.Array(Schema.Struct({ path: Schema.String, sha256: Schema.String })),
})

// Verification is independent of bundled Node/Chromium so backend discovery
// and the document executor can use the same per-skill revision.
export async function verifyBundledSkills(resources: string) {
  if (!isAbsolute(resources) || !(await stat(resources)).isDirectory())
    throw Error("LOGINOM_SKILL_RESOURCES_INVALID")
  const decoded = Schema.decodeUnknownOption(Schema.fromJsonString(manifest))(
    await readFile(join(resources, "resource-manifest.json"), "utf8"),
  )
  if (Option.isNone(decoded)) throw Error("LOGINOM_SKILL_MANIFEST_INVALID")
  const root = await realpath(resources)
  const entries = decoded.value.files.filter((file) => file.path.startsWith("skills/"))
  const listed = new Set(entries.map((file) => file.path))
  const actual = await readdir(join(root, "skills"), { recursive: true, withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT" && entries.length === 0) return []
      throw error
    },
  )
  for (const file of actual.filter((file) => !file.isDirectory())) {
    if (!listed.has(relative(root, join(file.parentPath, file.name)).split(sep).join("/")))
      throw Error("LOGINOM_SKILL_UNMANIFESTED_FILE")
  }
  for (const file of entries) {
    if (
      !/^skills\/[a-z0-9]+(?:-[a-z0-9]+)*\/.+/.test(file.path) ||
      file.path.includes("\\") ||
      file.path.split("/").some((part) => !part || part === "." || part === "..") ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    )
      throw Error("LOGINOM_SKILL_MANIFEST_INVALID")
    const absolute = await realpath(join(root, file.path))
    const inside = relative(root, absolute)
    if (isAbsolute(inside) || inside === ".." || inside.startsWith(".." + sep))
      throw Error("LOGINOM_SKILL_RESOURCE_ESCAPE")
    if (createHash("sha256").update(await readFile(absolute)).digest("hex") !== file.sha256)
      throw Error("LOGINOM_SKILL_HASH_MISMATCH")
  }
  return entries
    .filter((file) => /^skills\/[^/]+\/SKILL\.md$/.test(file.path))
    .map((file) => {
      const prefix = file.path.slice(0, -"SKILL.md".length)
      const files = entries.filter((entry) => entry.path.startsWith(prefix)).toSorted((a, b) => a.path.localeCompare(b.path))
      return {
        name: file.path.split("/")[1],
        directory: join(root, prefix),
        location: join(root, file.path),
        files,
        digest: createHash("sha256")
          .update(JSON.stringify(files.map((entry) => [entry.path.slice(prefix.length), entry.sha256])))
          .digest("hex"),
      }
    })
}
