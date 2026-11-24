import { randomUUID, createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { cp, lstat, mkdir, mkdtemp, readdir, readlink, realpath, rename, rm } from "node:fs/promises"
import { basename, isAbsolute, join, relative, sep, win32 } from "node:path"
import { validateSkillFolder } from "../bundled-skills"

const lookup = (path: string) =>
  lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error
  })

async function directory(path: string, create = false) {
  if (create) {
    await mkdir(path, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error
    })
  }
  const info = await lookup(path)
  if (info && !info.isDirectory()) throw Error("Unsafe skill installation directory: " + path)
  return info
}

async function tree(root: string, signal?: AbortSignal, omitGit = false) {
  const entries = new Map<string, { absolute: string; canonical: string; link?: string; kind: "file" | "directory" | "link" }>()
  await visit(root)
  return entries

  async function visit(parent: string) {
    for (const entry of await readdir(parent, { withFileTypes: true })) {
      signal?.throwIfAborted()
      if (omitGit && entry.name.toLowerCase() === ".git") continue
      const absolute = join(parent, entry.name)
      const name = relative(root, absolute).split(sep).join("/")
      if (!entry.isFile() && !entry.isDirectory() && !entry.isSymbolicLink())
        throw Error("Unsupported skill resource: " + name)
      if (entry.isDirectory()) {
        entries.set(name, { absolute, canonical: absolute, kind: "directory" })
        await visit(absolute)
        continue
      }
      const link = entry.isSymbolicLink() ? await readlink(absolute) : undefined
      const canonical = link === undefined ? absolute : await realpath(absolute)
      const target = relative(root, canonical)
      if (link !== undefined && (
        win32.isAbsolute(link) || isAbsolute(target) || target === ".." || target.startsWith(".." + sep) ||
        (omitGit && target.split(sep).some((part) => part.toLowerCase() === ".git"))
      )) throw Error("Link leaves the portable skill folder: " + name)
      entries.set(name, { absolute, canonical, link, kind: link === undefined ? "file" : "link" })
    }
  }
}

async function revision(root: string, signal?: AbortSignal) {
  const hash = createHash("sha256")
  const entries = await tree(root, signal)
  for (const name of [...entries.keys()].sort()) {
    const resource = entries.get(name)!
    const mode = resource.kind === "file" ? (await lstat(resource.absolute)).mode & 0o111 : 0
    const bytes = createHash("sha256")
    if (resource.kind === "file") {
      for await (const chunk of createReadStream(resource.absolute, { signal })) bytes.update(chunk)
    }
    hash.update(JSON.stringify([name, resource.kind, mode, resource.link, bytes.digest("hex")]))
  }
  return hash.digest("hex")
}

export async function prepareLocalSkill(
  source: string,
  home: string,
  authorizeRead: (paths: string[]) => Promise<void>,
  signal?: AbortSignal,
) {
  const root = await realpath(source)
  if (!(await lookup(join(root, "SKILL.md")))) throw Error("The source folder needs a root SKILL.md.")
  const entries = await tree(root, signal, true)
  const files = new Map([...entries.values()].map((entry) => [entry.absolute, entry.canonical]))
  await authorizeRead([...new Set([...files].flat())])
  signal?.throwIfAborted()

  const agents = join(await realpath(home), ".agents")
  await directory(agents, true)
  const skills = join(agents, "skills")
  const control = join(agents, ".loginom-skill-install")
  const controlInfo = await directory(control, true)
  const skillsInfo = await directory(skills)
  if (skillsInfo && skillsInfo.dev !== controlInfo?.dev)
    throw Error("Skill staging and installation must be on the same filesystem.")
  const stage = await mkdtemp(join(control, "draft-"))
  const draft = join(stage, basename(source))
  const dispose = () => rm(stage, { recursive: true, force: true })
  try {
    await cp(root, draft, {
      recursive: true,
      verbatimSymlinks: true,
      filter: async (path) => {
        signal?.throwIfAborted()
        if (path === root) return true
        if (basename(path).toLowerCase() === ".git") return false
        const canonical = files.get(path)
        if (!canonical || await realpath(path) !== canonical) throw Error("The source changed while creating the skill snapshot.")
        return true
      },
    })
    const preparedEntries = [...(await tree(draft, signal)).keys()]
    const nested = preparedEntries.filter((path) => path.endsWith("/SKILL.md"))
    if (nested.length) throw Error("Choose one standalone skill directory. Found: " + ["SKILL.md", ...nested].join(", "))
    const validated = await validateSkillFolder(draft, { external: true })
    if (!validated.data || validated.errors.length) throw Error(validated.errors.map((item) => item.message).join("\n"))
    const name = validated.data.name
    const path = join(skills, name)
    const digest = await revision(draft, signal)
    const current = async () => {
      if (!(await directory(skills))) return
      const other = (await readdir(skills)).find((entry) =>
        entry !== name && entry.normalize().toLowerCase() === name.normalize().toLowerCase(),
      )
      if (other) throw Error("Ambiguous skill installation path: " + other)
      if (!(await directory(path))) return
      return revision(path, signal)
    }
    const previous = await current()
    return {
      id: randomUUID(),
      source,
      path,
      paths: [path, ...preparedEntries.map((entry) => join(path, entry))],
      name,
      description: validated.data.description,
      warnings: [
        ...validated.warnings.map((item) => item.message),
        ...(typeof validated.data.compatibility === "string"
          ? ["Declared environment requirements: " + validated.data.compatibility]
          : []),
        ...(typeof validated.data["allowed-tools"] === "string"
          ? ["Declared tools (permissions unchanged): " + validated.data["allowed-tools"]]
          : []),
      ],
      digest,
      previous,
      dispose,
      async publish() {
        signal?.throwIfAborted()
        const existing = await current()
        if (existing === digest) return "already-installed" as const
        if (existing !== undefined || previous !== undefined) throw Error("This skill name is already installed.")
        if (await revision(draft, signal) !== digest) throw Error("The prepared skill changed. Prepare it again.")
        signal?.throwIfAborted()
        await directory(skills, true)
        await rename(draft, path)
        return "installed" as const
      },
    }
  } catch (error) {
    await dispose()
    throw error
  }
}
