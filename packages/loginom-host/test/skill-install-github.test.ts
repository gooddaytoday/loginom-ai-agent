import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { BlobWriter, TextReader, ZipWriter } from "@zip.js/zip.js"
import { prepareGitHubSkill } from "../src/skill-install/github"
import { Flock } from "../../core/src/util/flock"

const sha = "a".repeat(40)
const header = (name: string) => `---\nname: ${name}\ndescription: Checks columns.\n---\n`

test("fixes the GitHub revision and strips read authorization at the archive redirect", async () => {
  const home = await mkdtemp(join(tmpdir(), "loginom-github-home-"))
  const priorToken = process.env.GITHUB_TOKEN
  process.env.GITHUB_TOKEN = "fixture-read-only"
  const writer = new ZipWriter(new BlobWriter())
  await writer.add("owner-repo-a/skills/columns/SKILL.md", new TextReader(header("columns") + "[Schema](references/table.md)"))
  await writer.add("owner-repo-a/skills/columns/references/table.md", new TextReader("id, amount"))
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
        lock: (name, control, run) => Flock.withLock("skill-install:" + name, run, { dir: control }),
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
      lock: <T>(name: string, control: string, run: () => Promise<T>) => Flock.withLock("skill-install:" + name, run, { dir: control }),
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
      lock: <T>(name: string, control: string, run: () => Promise<T>) => Flock.withLock("skill-install:" + name, run, { dir: control }),
      signal: signal.signal,
    }
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
