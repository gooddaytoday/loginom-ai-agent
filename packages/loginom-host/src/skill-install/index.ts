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

class InstalledPathsChanged extends Error {}

const readPaths = (root: string, entries: Awaited<ReturnType<typeof tree>>) =>
  [...new Set([root, ...[...entries.values()].flatMap((item) => [item.absolute, item.canonical])])]

async function revision(root: string, signal?: AbortSignal, admitted?: Set<string>) {
  const hash = createHash("sha256")
  const entries = await tree(root, signal)
  if (admitted && readPaths(root, entries).some((path) => !admitted.has(path)))
    throw new InstalledPathsChanged("The installed skill changed while checking read access. Retry the installation.")
  for (const name of [...entries.keys()].sort()) {
    const resource = entries.get(name)!
    const mode = resource.kind === "file" ? (await lstat(resource.absolute)).mode & 0o111 : 0
    const bytes = createHash("sha256")
    if (resource.kind === "file") {
      for await (const chunk of createReadStream(resource.absolute, { signal })) bytes.update(chunk)
    }
    hash.update(JSON.stringify([name, resource.kind, mode, resource.link, bytes.digest("hex")]))
  }
  return { digest: hash.digest("hex"), paths: [root, ...[...entries.values()].map((entry) => entry.absolute)] }
}

export async function prepareLocalSkill(
  source: string,
  home: string,
  authorizeRead: (paths: string[]) => Promise<void>,
  options: {
    lock: <T>(name: string, control: string, run: () => Promise<T>) => Promise<T>
    signal?: AbortSignal
    move?: typeof rename
    authorizeInstalled?: (path: string, resources: string[]) => Promise<void>
  },
) {
  const signal = options.signal
  const move = options.move ?? rename
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
    const digest = (await revision(draft, signal)).digest
    const key = name.normalize().toLowerCase()
    const recovery = join(control, "previous-" + createHash("sha256").update(key).digest("hex"))
    const locked = async <T>(run: () => Promise<T>) => {
      if (await realpath(control) !== control) throw Error("The installation directory changed.")
      return options.lock(key, control, run)
    }
    const current = async (admitted: Set<string>) => {
      if (!(await directory(skills))) return
      const other = (await readdir(skills)).find((entry) =>
        entry !== name && entry.normalize().toLowerCase() === name.normalize().toLowerCase(),
      )
      if (other) throw Error("Ambiguous skill installation path: " + other)
      if (!(await directory(path))) return
      return revision(path, signal, admitted)
    }
    const findBackup = async () => {
      if (!(await directory(recovery))) return
      const backups = await readdir(recovery)
      if (!backups.length) return
      if (backups.length !== 1 || !/^[a-f0-9]{64}$/.test(backups[0]))
        throw Error("Ambiguous skill replacement recovery; the saved versions were kept.")
      const backup = join(recovery, backups[0])
      if (!(await directory(backup))) throw Error("The previous skill copy is unavailable.")
      return backup
    }
    const admitted = new Set<string>()
    const authorizeCurrent = async () => {
      if (!(await directory(agents)) || !(await directory(control))) throw Error("The installation directory changed.")
      const existing = (await directory(skills)) && (await directory(path)) ? path : await findBackup()
      if (!existing) return
      const required = readPaths(existing, await tree(existing, signal))
        .map((resource) => join(path, relative(existing, resource)))
        .filter((resource) => !admitted.has(resource))
      if (!required.length) return
      await options.authorizeInstalled?.(path, required)
      required.forEach((resource) => admitted.add(resource))
    }
    const withCurrentAccess = async <T>(run: () => Promise<T>) => {
      await authorizeCurrent()
      try {
        return await locked(run)
      } catch (error) {
        if (!(error instanceof InstalledPathsChanged)) throw error
      }
      await authorizeCurrent()
      return locked(run)
    }
    const recover = async () => {
      if (!(await directory(agents)) || !(await directory(control))) throw Error("The installation directory changed.")
      const existing = await current(admitted)
      const backup = await findBackup()
      if (!backup) return existing
      if (!existing) {
        await directory(skills, true)
        await move(backup, path)
        return current(admitted)
      }
      if (existing.digest !== basename(backup))
        throw Error("An interrupted replacement and a different installed version both exist; the versions were kept.")
      await rm(backup, { recursive: true })
      return existing
    }
    const previous = await withCurrentAccess(recover)
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
      publish(approved: typeof previous) {
        return withCurrentAccess(async () => {
          signal?.throwIfAborted()
          const existing = await recover()
          if (existing?.digest === digest) return "already-installed" as const
          if (existing?.digest !== approved?.digest) return { previous: existing }
          if ((await revision(draft, signal)).digest !== digest) throw Error("The prepared skill changed. Prepare it again.")
          signal?.throwIfAborted()
          await directory(skills, true)
          if (!existing) {
            await move(draft, path)
            return "installed" as const
          }
          await directory(recovery, true)
          const backup = join(recovery, digest)
          await move(path, backup)
          try {
            signal?.throwIfAborted()
            await move(draft, path)
          } catch (error) {
            if (!(await lookup(path))) await move(backup, path)
            throw error
          }
          await rm(backup, { recursive: true }).catch(() => {
            // Publication succeeded. The next operation can clean up this known predecessor.
            console.warn("Could not remove a completed skill replacement backup")
          })
          return "installed" as const
        })
      },
    }
  } catch (error) {
    await dispose()
    throw error
  }
}
