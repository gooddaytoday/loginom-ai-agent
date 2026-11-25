import { expect, test } from "bun:test"
import { mkdtemp, readlink, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { BlobWriter, TextReader, ZipWriter } from "@zip.js/zip.js"
import { githubSkillURL, prepareGitHubSkill } from "../src/skill-install/github"
import { Flock } from "../../core/src/util/flock"

const sha = "a".repeat(40)
const header = (name: string) => `---\nname: ${name}\ndescription: Checks columns.\n---\n`
const lock = <T>(name: string, control: string, run: () => Promise<T>) =>
  Flock.withLock("skill-install:" + name, run, { dir: control })

test("fixes the GitHub revision and strips read authorization at the archive redirect", async () => {
  const home = await mkdtemp(join(tmpdir(), "loginom-github-home-"))
  const priorToken = process.env.GITHUB_TOKEN
  process.env.GITHUB_TOKEN = "fixture-read-only"
  const writer = new ZipWriter(new BlobWriter())
  await writer.add("owner-repo-a/skills/columns/SKILL.md", new TextReader(header("columns") + "[Schema](references/table.md)"))
  await writer.add("owner-repo-a/skills/columns/references/table.md", new TextReader("id, amount"))
  await writer.add("owner-repo-a/notes/Release: June.md", new TextReader("Release notes"))
  const archive = await writer.close()
  const credentials: { origin: string; authorized: boolean }[] = []
  const api = Bun.serve({
    port: 0, hostname: "127.0.0.1",
    fetch(request) {
      const url = new URL(request.url)
      credentials.push({ origin: "api", authorized: request.headers.get("authorization") === "Bearer fixture-read-only" })
      if (url.pathname === "/repos/owner/repo/commits/team%2Ffeature") return Response.json({ sha })
      if (url.pathname === `/repos/owner/repo/zipball/${sha}`)
        return Response.redirect("https://codeload.github.com/fixture.zip")
      return new Response(null, { status: 404 })
    },
  })
  const cdn = Bun.serve({
    port: 0, hostname: "127.0.0.1",
    fetch(request) {
      credentials.push({ origin: "cdn", authorized: request.headers.has("authorization") })
      return new Response(archive)
    },
  })
  try {
    const result = await prepareGitHubSkill(
      "https://github.com/owner/repo/tree/team/feature/skills/columns",
      home,
      {
        lock,
        fetch: (url: URL, init: RequestInit) => fetch(new URL(url.pathname, url.hostname === "api.github.com" ? api.url : cdn.url), init),
      },
    )
    expect(result.sha).toBe(sha)
    if (!result.candidate) throw Error("Expected one selected candidate")
    try {
      expect(result.directory).toBe("skills/columns")
      expect(credentials.filter((item) => item.origin === "api").every((item) => item.authorized)).toBe(true)
      expect(credentials.filter((item) => item.origin === "cdn")).toEqual([{ origin: "cdn", authorized: false }])
      expect(await result.candidate.publish(undefined)).toBe("installed")
      expect(await Bun.file(join(home, ".agents/skills/columns/references/table.md")).text()).toBe("id, amount")
    } finally {
      await result.candidate.dispose()
    }
  } finally {
    if (priorToken === undefined) delete process.env.GITHUB_TOKEN
    else process.env.GITHUB_TOKEN = priorToken
    api.stop()
    cdn.stop()
    await rm(home, { recursive: true, force: true })
  }
})

test("returns choices pinned to the default branch revision and refuses ambiguous ref paths", async () => {
  const home = await mkdtemp(join(tmpdir(), "loginom-github-choices-"))
  const writer = new ZipWriter(new BlobWriter())
  await writer.add("owner-repo-a/skills/columns/SKILL.md", new TextReader(header("columns")))
  await writer.add("owner-repo-a/SKILL.md", new TextReader(header("all-skills")))
  await writer.add("owner-repo-a/skills/rows/SKILL.md", new TextReader(header("rows")))
  const archive = await writer.close()
  const server = Bun.serve({
    port: 0, hostname: "127.0.0.1",
    fetch(request) {
      const path = new URL(request.url).pathname
      if (path === "/repos/owner/repo") return Response.json({ default_branch: "main" })
      if (path === "/repos/owner/repo/commits/main" || path === "/repos/owner/repo/commits/main%2Fskills")
        return Response.json({ sha })
      if (path === `/repos/owner/repo/zipball/${sha}`) return new Response(archive)
      return new Response(null, { status: 404 })
    },
  })
  try {
    const options = {
      lock,
      fetch: (url: URL, init: RequestInit) => fetch(new URL(url.pathname, server.url), init),
    }
    const result = await prepareGitHubSkill("https://github.com/owner/repo", home, options)
    expect(result.alternatives).toEqual([
      { name: "columns", directory: "skills/columns", source: `https://github.com/owner/repo/tree/${sha}/skills/columns` },
      { name: "rows", directory: "skills/rows", source: `https://github.com/owner/repo/tree/${sha}/skills/rows` },
    ])
    await expect(prepareGitHubSkill("https://github.com/owner/repo/tree/main/skills", home, options))
      .rejects.toThrow("ambiguous")
    expect(await Bun.file(join(home, ".agents/skills/columns/SKILL.md")).exists()).toBe(false)
  } finally {
    server.stop()
    await rm(home, { recursive: true, force: true })
  }
})

test("a damaged or cancelled archive leaves the installed copy alone", async () => {
  const home = await mkdtemp(join(tmpdir(), "loginom-github-cancel-"))
  try {
    const previous = join(home, ".agents/skills/columns/SKILL.md")
    await Bun.write(previous, header("columns"))
    const source = `https://github.com/owner/repo/tree/${sha}/skills/columns`
    const signal = new AbortController()
    const streaming = Promise.withResolvers<void>()
    const options = {
      lock,
      signal: signal.signal,
    }
    let downloaded = false
    await expect(prepareGitHubSkill(source, home, {
      ...options,
      fetch: async (url) => url.pathname.includes("/commits/") ? Response.json({ sha }) : new Response(
        new ReadableStream({
          pull(controller) { downloaded = true; controller.close() },
        }, { highWaterMark: 0 }),
        { headers: { "content-length": String(513 * 1024 * 1024) } },
      ),
    })).rejects.toThrow("512 MiB download limit")
    expect(downloaded).toBe(false)
    await expect(prepareGitHubSkill(source, home, {
      ...options,
      fetch: async (url) => url.pathname.includes("/commits/") ? Response.json({ sha }) : new Response("broken archive"),
    })).rejects.toThrow()
    const pending = prepareGitHubSkill(source, home, {
      ...options,
      fetch: async (url) => url.pathname.includes("/commits/") ? Response.json({ sha }) : new Response(
        new ReadableStream({
          start() { streaming.resolve() },
        }),
      ),
    })
    await streaming.promise
    signal.abort()
    await expect(pending).rejects.toThrow()
    expect(await Bun.file(previous).text()).toBe(header("columns"))
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test.skipIf(process.platform === "win32")("prepares a root skill and preserves its empty directory and relative link", async () => {
  const home = await mkdtemp(join(tmpdir(), "loginom-github-tree-"))
  try {
    const writer = new ZipWriter(new BlobWriter())
    await writer.add("owner-columns-a/SKILL.md", new TextReader(header("columns") + "[Schema](schema.md)"))
    await writer.add("owner-columns-a/docs/schema.md", new TextReader("id, amount"))
    await writer.add("owner-columns-a/schema.md", new TextReader("docs/schema.md"), {
      msDosCompatible: false,
      externalFileAttributes: 0o120777 << 16,
    })
    await writer.add("owner-columns-a/examples/", undefined, { directory: true })
    const archive = await writer.close()
    const result = await prepareGitHubSkill(githubSkillURL("https://github.com/owner/columns.git/"), home, {
      lock,
      fetch: async (url) => {
        if (url.pathname === "/repos/owner/columns") return Response.json({ default_branch: "main" })
        if (url.pathname === "/repos/owner/columns/commits/main") return Response.json({ sha })
        if (url.pathname === `/repos/owner/columns/zipball/${sha}`) return new Response(archive)
        return new Response(null, { status: 404 })
      },
    })
    expect(result.directory).toBe(".")
    if (!result.candidate) throw Error("Expected the root skill")
    try {
      expect(await result.candidate.publish(undefined)).toBe("installed")
      expect(await readlink(join(result.candidate.path, "schema.md"))).toBe("docs/schema.md")
      expect(await Bun.file(join(result.candidate.path, "schema.md")).text()).toBe("id, amount")
      expect(await Bun.file(join(result.candidate.path, "examples")).stat().then((info) => info.isDirectory())).toBe(true)
    } finally {
      await result.candidate.dispose()
    }
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test("reports GitHub source failures without preparing an installation", async () => {
  const home = await mkdtemp(join(tmpdir(), "loginom-github-unavailable-"))
  try {
    const repo = "https://github.com/owner/columns"
    const tree = repo + "/tree/" + sha
    expect(() => githubSkillURL("https://example.invalid/owner/columns")).toThrow("Use an HTTPS GitHub repository")
    expect(() => githubSkillURL(repo + "/pull/1")).toThrow("Use an HTTPS GitHub repository")
    await expect(prepareGitHubSkill(repo, home, {
      lock,
      fetch: async () => { throw Error("offline") },
    })).rejects.toThrow("Could not reach GitHub")
    await expect(prepareGitHubSkill(repo, home, {
      lock,
      fetch: async (url) => Response.redirect(url),
    })).rejects.toThrow("Too many GitHub redirects")
    const origins: string[] = []
    await expect(prepareGitHubSkill(repo, home, {
      lock,
      fetch: async (url) => {
        origins.push(url.origin)
        return Response.redirect("https://example.invalid/moved")
      },
    })).rejects.toThrow("Unsupported GitHub redirect")
    expect(origins).toEqual(["https://api.github.com"])
    await expect(prepareGitHubSkill(repo, home, {
      lock,
      fetch: async () => new Response("Forbidden", { status: 403 }),
    })).rejects.toThrow("GitHub repository is unavailable")
    await expect(prepareGitHubSkill(repo, home, {
      lock,
      fetch: async () => Response.json({}),
    })).rejects.toThrow("Could not determine the default GitHub branch")
    await expect(prepareGitHubSkill(tree, home, {
      lock,
      fetch: async () => new Response(null, { status: 404 }),
    })).rejects.toThrow("GitHub revision is unavailable")
    await expect(prepareGitHubSkill(tree, home, {
      lock,
      fetch: async (url) => url.pathname.includes("/commits/")
        ? Response.json({ sha })
        : new Response("Unavailable", { status: 503 }),
    })).rejects.toThrow("Could not download GitHub skill archive")
    expect(await Bun.file(join(home, ".agents/skills/columns/SKILL.md")).exists()).toBe(false)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test("validates resource names inside the selected GitHub tree before staging", async () => {
  const home = await mkdtemp(join(tmpdir(), "loginom-github-portable-names-"))
  try {
    const writer = new ZipWriter(new BlobWriter())
    await writer.add("owner-repo-a/columns/SKILL.md", new TextReader(header("columns")))
    await writer.add("owner-repo-a/columns/Guide.md", new TextReader("First guide"))
    await writer.add("owner-repo-a/columns/guide.md", new TextReader("Second guide"))
    await writer.add("owner-repo-a/rows/SKILL.md", new TextReader(header("rows")))
    await writer.add("owner-repo-a/rows/Release: June.md", new TextReader("Release notes"))
    const archive = await writer.close()
    for (const [folder, diagnostic] of [
      ["missing", "No SKILL.md found"],
      ["columns", "Ambiguous paths in the selected skill"],
      ["rows", "Non-portable resource path in the selected skill"],
    ]) {
      await expect(prepareGitHubSkill(`https://github.com/owner/repo/tree/${sha}/${folder}`, home, {
        lock,
        fetch: async (url) => url.pathname.includes("/commits/") ? Response.json({ sha }) : new Response(archive),
      })).rejects.toThrow(diagnostic)
    }
    expect(await Bun.file(join(home, ".agents/skills/columns/SKILL.md")).exists()).toBe(false)
    expect(await Bun.file(join(home, ".agents/skills/rows/SKILL.md")).exists()).toBe(false)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
