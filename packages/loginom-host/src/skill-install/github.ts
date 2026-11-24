import { createWriteStream, openAsBlob } from "node:fs"
import { chmod, mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import { basename, dirname, join, posix, win32 } from "node:path"
import { tmpdir } from "node:os"
import { Writable } from "node:stream"
import { BlobReader, TextWriter, ZipReader, type Entry } from "@zip.js/zip.js"
import { readSkillHeader } from "../../../loginom-runtime/client/lib/bundled-skill-manifest.mjs"
import { prepareLocalSkill } from "./index"

type GitHubOptions = Parameters<typeof prepareLocalSkill>[3] & {
  fetch?: (url: URL, init: RequestInit) => Promise<Response>
}
const api = "https://api.github.com"
const web = "https://github.com"
const archiveOrigin = "https://codeload.github.com"
const maxSkillSize = 512 * 1024 * 1024

function repository(source: string) {
  const url = URL.parse(source)
  if (!url || url.origin !== web || url.username || url.password)
    throw Error("Use an HTTPS GitHub repository or tree URL.")
  const parts = decodeURIComponent(url.pathname).replace(/^\/|\/$/g, "").split("/")
  const repo = parts[1]?.replace(/\.git$/i, "")
  if (!/^[a-z0-9_-]+$/i.test(parts[0]) || !repo || !/^[a-z0-9_.-]+$/i.test(repo) ||
    parts.some((part) => !part || part === "." || part === ".." || /[\\\p{Cc}]/u.test(part)) ||
    (parts.length !== 2 && (parts[2] !== "tree" || parts.length < 4)))
    throw Error("Use an HTTPS GitHub repository or tree URL.")
  const slug = parts[0] + "/" + repo
  const tree = parts.slice(3)
  return { slug, repo, tree, source: web + "/" + slug + (tree.length ? "/tree/" + tree.map(encodeURIComponent).join("/") : "") }
}

export function githubSkillURL(source: string) {
  return repository(source).source
}

function archiveFiles(entries: Entry[]) {
  const paths = new Map<string, Entry>()
  let root: string | undefined
  for (const entry of entries) {
    const parts = entry.filename.replace(/\/$/, "").split("/")
    if (parts.some((part) => !part || part === "." || part === ".." || /[:\\\p{Cc}]/u.test(part)))
      throw Error("Unsafe GitHub archive path.")
    root ??= parts[0]
    if (root !== parts[0] || (parts.length === 1 && !entry.directory)) throw Error("Invalid GitHub archive root.")
    const path = parts.slice(1).join("/")
    if (!path || parts.some((part) => part.toLowerCase() === ".git")) continue
    if (paths.has(path)) throw Error("Duplicate GitHub archive path.")
    paths.set(path, entry)
  }
  return paths
}

function mode(entry: Entry) {
  return entry.msDosCompatible ? 0 : entry.externalFileAttributes >>> 16
}

export async function prepareGitHubSkill(source: string, home: string, options: GitHubOptions) {
  const spec = repository(source)
  const endpoint = api + "/repos/" + spec.slug
  const send = options.fetch ?? fetch
  const token = process.env.GITHUB_TOKEN
  const request = async (url: URL, archive = false) => {
    for (let redirect = 0; redirect < 4; redirect++) {
      if ((url.origin !== api && !(archive && url.origin === archiveOrigin)) || url.username || url.password)
        throw Error("Unsupported GitHub redirect.")
      const response = await send(url, {
        signal: options.signal,
        redirect: "manual",
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "Loginom-AI-Agent",
          ...(url.origin === api && token ? { Authorization: "Bearer " + token } : {}),
        },
      }).catch(() => {
        options.signal?.throwIfAborted()
        throw Error("Could not reach GitHub.")
      })
      const location = response.headers.get("location")
      if (response.status < 300 || response.status >= 400 || !location) return response
      await response.body?.cancel()
      url = new URL(location, url)
    }
    throw Error("Too many GitHub redirects.")
  }
  const read = async (url: string, missing = false) => {
    const response = await request(new URL(url))
    if (missing && (response.status === 404 || response.status === 422)) {
      await response.body?.cancel()
      return
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw Error("GitHub repository is unavailable. Check access or provide a local skill folder.")
    }
    return await response.json() as { sha?: unknown; default_branch?: unknown } | null
  }
  const branch = !spec.tree.length ? (await read(endpoint))?.default_branch : undefined
  if (!spec.tree.length && (typeof branch !== "string" || !branch))
    throw Error("Could not determine the default GitHub branch.")
  const refs = typeof branch === "string" ? [{ ref: branch, path: "" }]
    : /^[a-f0-9]{40}$/i.test(spec.tree[0]) ? [{ ref: spec.tree[0], path: spec.tree.slice(1).join("/") }]
    : spec.tree.map((_, i) => ({ ref: spec.tree.slice(0, i + 1).join("/"), path: spec.tree.slice(i + 1).join("/") }))
  const matches: { sha: string; path: string }[] = []
  for (const item of refs) {
    const sha = (await read(endpoint + "/commits/" + encodeURIComponent(item.ref), true))?.sha
    if (typeof sha === "string" && /^[a-f0-9]{40}$/.test(sha)) matches.push({ sha, path: item.path })
  }
  if (!matches.length) throw Error("GitHub revision is unavailable. Check access or provide a local skill folder.")
  if (matches.length > 1) throw Error("The GitHub ref and folder are ambiguous. Use a full commit SHA in the tree URL.")
  const selected = matches[0]
  const temporary = await mkdtemp(join(tmpdir(), "loginom-github-skill-"))
  try {
    const download = await request(new URL(endpoint + "/zipball/" + selected.sha), true)
    if (!download.ok || !download.body) {
      await download.body?.cancel()
      throw Error("Could not download GitHub skill archive. Check access or provide a local skill folder.")
    }
    const zip = join(temporary, "source.zip")
    await download.body.pipeTo(Writable.toWeb(createWriteStream(zip, { mode: 0o600 })), { signal: options.signal })
    const reader = new ZipReader(new BlobReader(await openAsBlob(zip)), { useWebWorkers: false })
    try {
      const entries = archiveFiles(await reader.getEntries())
      const prefix = selected.path ? selected.path + "/" : ""
      const skills = [...entries].filter(([path, entry]) =>
        !entry.directory && path.startsWith(prefix) && posix.basename(path) === "SKILL.md",
      )
      if (!skills.length) throw Error("No SKILL.md found in the selected GitHub directory.")
      if (skills.length > 1) {
        const standalone = skills.filter(([path]) => {
          const folder = posix.dirname(path)
          return folder !== "." && !skills.some(([other]) => other !== path && other.startsWith(folder + "/"))
        })
        const alternatives = await Promise.all(standalone.map(async ([path, entry]) => {
          const directory = posix.dirname(path)
          const info = entry.uncompressedSize <= 256 * 1024 && (mode(entry) & 0o170000) !== 0o120000
            ? readSkillHeader(await entry.getData!(new TextWriter(), { signal: options.signal, checkSignature: true }))
            : undefined
          return {
            name: info?.name ?? directory,
            directory,
            source: web + "/" + spec.slug + "/tree/" + selected.sha
              + (directory === "." ? "" : "/" + directory.split("/").map(encodeURIComponent).join("/")),
          }
        }))
        return { sha: selected.sha, alternatives }
      }
      const directory = posix.dirname(skills[0][0])
      const subtree = directory === "." ? "" : directory + "/"
      const pack = [...entries].filter(([path]) => path.startsWith(subtree)).map(([path, entry]) => [path.slice(subtree.length), entry] as const)
      if (pack.reduce((total, [, entry]) => total + entry.uncompressedSize, 0) > maxSkillSize)
        throw Error("The selected skill exceeds the 512 MiB unpacked size limit.")
      const folder = directory === "." ? spec.repo : basename(directory)
      const names = new Map<string, string>()
      for (const name of [folder, ...pack.map(([path]) => path)]) {
        let prefix = ""
        for (const part of name.split("/")) {
          if (/[<>:"|?*]/.test(part) || /[. ]$/.test(part) ||
            /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part))
            throw Error("Non-portable resource path in the selected skill.")
          prefix += "/" + part
          const key = prefix.normalize().toLowerCase()
          const previous = names.get(key)
          if (previous && previous !== prefix) throw Error("Ambiguous paths in the selected skill.")
          names.set(key, prefix)
        }
      }
      const destination = join(temporary, "skill", folder)
      await mkdir(destination, { recursive: true })
      const links: { filename: string; target: string }[] = []
      for (const [path, entry] of pack) {
        options.signal?.throwIfAborted()
        const filename = join(destination, path)
        if (entry.directory) {
          await mkdir(filename, { recursive: true })
          continue
        }
        const type = mode(entry) & 0o170000
        await mkdir(dirname(filename), { recursive: true })
        if (type === 0o120000) {
          if (entry.uncompressedSize > 4096) throw Error("Invalid skill link.")
          const target = await entry.getData!(new TextWriter(), { signal: options.signal, checkSignature: true })
          const resolved = posix.join(posix.dirname(path), target)
          if (!target || /[:\\\p{Cc}]/u.test(target) || win32.isAbsolute(target) || resolved === ".." || resolved.startsWith("../"))
            throw Error("Link leaves the portable skill folder: " + path)
          links.push({ filename, target })
          continue
        }
        if (type !== 0 && type !== 0o100000) throw Error("Unsupported file type in selected skill.")
        await entry.getData!(Writable.toWeb(createWriteStream(filename, { flags: "wx", mode: 0o600 })), {
          signal: options.signal, checkSignature: true,
        })
        if (process.platform !== "win32") await chmod(filename, 0o600 | (mode(entry) & 0o111))
      }
      for (const link of links) await symlink(link.target, link.filename)
      const candidate = await prepareLocalSkill(destination, home, async () => {}, options)
      return { sha: selected.sha, directory, candidate }
    } finally {
      await reader.close()
    }
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
