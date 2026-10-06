import { createHash } from "node:crypto"
import { readFile, readdir, realpath, stat } from "node:fs/promises"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { Option, Schema } from "effect"
import { parseDocument } from "yaml"
import { bundledSkillInventory } from "../../loginom-runtime/client/lib/bundled-skill-manifest.mjs"

const manifest = Schema.Struct({
  protocol: Schema.Literal(1),
  files: Schema.Array(Schema.Struct({ path: Schema.String, sha256: Schema.String })),
})
const frontmatter = Schema.Struct({
  name: Schema.String,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.String)),
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
  for (const entry of entries.filter((file) => /^skills\/[^/]+\/SKILL\.md$/.test(file.path))) {
    const directory = join(root, dirname(entry.path))
    const content = await readFile(join(root, entry.path), "utf8")
    const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)?.[1]
    if (!header) throw Error("LOGINOM_SKILL_FRONTMATTER_INVALID")
    const yaml = parseDocument(header)
    if (yaml.errors.length) throw Error("LOGINOM_SKILL_FRONTMATTER_INVALID")
    const data = Schema.decodeUnknownOption(frontmatter)(yaml.toJS() as unknown)
    if (Option.isNone(data) || data.value.name !== entry.path.split("/")[1])
      throw Error("LOGINOM_SKILL_FRONTMATTER_INVALID")
    const generated = data.value.metadata?.["loginom-generated"]
    if (generated) requireResource(root, directory, directory, generated, listed)
    for (const markdown of entries.filter((file) => file.path.startsWith(dirname(entry.path) + "/") && file.path.endsWith(".md"))) {
      const text = await readFile(join(root, markdown.path), "utf8")
      for (const link of text.matchAll(/\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\)/g)) {
        const target = link[1] ?? link[2]
        if (/^(?:https?:|viking:|mailto:|#)/i.test(target)) continue
        requireResource(root, directory, dirname(join(root, markdown.path)), target, listed)
      }
    }
  }
  return bundledSkillInventory(entries).map((skill) => ({
    ...skill,
    directory: join(root, "skills", skill.name),
    location: join(root, "skills", skill.name, "SKILL.md"),
  }))
}

function requireResource(root: string, skill: string, parent: string, target: string, listed: Set<string>) {
  const path = resolve(parent, decodeURIComponent(target.split(/[?#]/)[0]))
  const inside = relative(skill, path)
  if (!inside || isAbsolute(inside) || inside === ".." || inside.startsWith(".." + sep))
    throw Error("LOGINOM_SKILL_RESOURCE_ESCAPE")
  if (!listed.has(relative(root, path).split(sep).join("/")))
    throw Error("LOGINOM_SKILL_REQUIRED_RESOURCE_MISSING")
}
