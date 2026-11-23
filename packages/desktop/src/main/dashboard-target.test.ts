import { expect, test } from "bun:test"
import { readDashboardSnapshot, updatePublicationBase } from "@loginom-ai-agent/dashboard/agent/folder"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { checkDashboardTarget, getDashboardTarget, type DashboardDeps } from "./dashboard-target"

const id = "3b4aa44a-5c86-4798-aa7e-4f16a59e9c6b"
const snapshot = {
  id,
  created: "2026-11-13T00:00:00.000Z",
  binding: {
    packagePath: "/user/fixture/campaign.lgp",
    workflowGuid: "27cb94a9-f6e9-35ff-80b7-bc7d01ba6aa7",
    nodeGuid: "77c145b1-6ce3-458f-aa36-e6afdab2a930",
  },
  nodeName: "По убыванию ROI",
  sample: { schema: [{ name: "count", type: 1 }], rows: [[42]] },
  parameters: [],
  published: false,
}
const editSnapshot = { ...snapshot, published: true }

test("creates a dashboard from the one-time snapshot without signing in to Studio", async () => {
  const root = await mkdtemp(join(tmpdir(), "desktop-dashboard-"))
  const requests: [unknown, RequestInit | undefined][] = []
  const studio: string[] = []
  const refreshed = { ...snapshot, id: crypto.randomUUID(), sample: { ...snapshot.sample, rows: [[43]] } }
  const snapshotURL = "http://127.0.0.1:32768/dashboard/snapshots/"
  const deps: DashboardDeps = {
    settled: async () => { studio.push("settled") },
    catalog: async () => { studio.push("catalog") },
    status: async () => ({ url: "http://127.0.0.1:32768/app/?x=1", generation: 2 }),
    dashboards: () => join(root, "dashboards"),
    readPublication: async () => { studio.push("readPublication"); return null },
    template: resolve(import.meta.dirname, "../../../dashboard/template"),
    fetch: async (url, init) => {
      requests.push([url, init])
      return Response.json(url === snapshotURL + id ? snapshot : refreshed)
    },
  }
  try {
    const target = await getDashboardTarget(id, deps)
    const options = { redirect: "error", signal: undefined }
    expect(requests).toEqual([[snapshotURL + id, options]])
    expect(target).toMatchObject({ nodeName: snapshot.nodeName, action: "create", fresh: true })
    expect(target.directory.startsWith(join(root, "dashboards") + "/")).toBe(true)
    expect(JSON.parse(await readFile(join(target.directory, "sample.json"), "utf8"))).toEqual(snapshot.sample)
    expect(studio).toEqual([])
    expect(target.notice).toBeUndefined()
    const original = readDashboardSnapshot(target.directory)!
    expect(original.control).not.toHaveProperty("base")

    const source = join(target.directory, "src/main.tsx")
    await writeFile(source, "// local edit")
    const base = { name: "20261115T120000Z.json", sourceHash: "a".repeat(64) }
    updatePublicationBase(target.directory, original.control, base)
    expect(await getDashboardTarget(refreshed.id, deps)).toEqual({
      directory: target.directory, nodeName: snapshot.nodeName, action: "create", fresh: false,
    })
    expect(requests).toEqual([[snapshotURL + id, options], [snapshotURL + refreshed.id, options]])
    expect(studio).toEqual([])
    expect(await readFile(source, "utf8")).toBe("// local edit")
    const reopened = readDashboardSnapshot(target.directory)
    expect(reopened?.sample).toEqual(refreshed.sample)
    expect(reopened?.control.base).toEqual(base)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("an unconfigured stand fails before fetching a snapshot", async () => {
  const requests: unknown[] = []
  await expect(
    getDashboardTarget(id, {
      settled: async () => {}, catalog: async () => {},
      status: async () => ({ url: "http://127.0.0.1:32768/app/?x=1", generation: 0 }),
      dashboards: () => "/unused/dashboards",
      readPublication: async () => null,
      template: resolve(import.meta.dirname, "../../../dashboard/template"),
      fetch: async (url) => {
        requests.push(url)
        return new Response(null, { status: 404 })
      },
    }),
  ).rejects.toThrow("DASHBOARD_NOT_CONFIGURED")
  expect(requests).toEqual([])
})

test("an unavailable snapshot reports the public snapshot error", async () => {
  await expect(
    getDashboardTarget(id, {
      settled: async () => {}, catalog: async () => {},
      status: async () => ({ url: "http://127.0.0.1:32768/app/?x=1", generation: 2 }),
      dashboards: () => "/unused/dashboards",
      readPublication: async () => null,
      template: resolve(import.meta.dirname, "../../../dashboard/template"),
      fetch: async () => new Response(null, { status: 404 }),
    }),
  ).rejects.toThrow("DASHBOARD_SNAPSHOT_UNAVAILABLE")
})

test("checks the prepared local folder without consuming a snapshot again", async () => {
  const root = await mkdtemp(join(tmpdir(), "desktop-dashboard-"))
  try {
    await getDashboardTarget(id, {
      settled: async () => {}, catalog: async () => {},
      status: async () => ({ url: "http://127.0.0.1:32768/app/?x=1", generation: 2 }),
      dashboards: () => join(root, "dashboards"),
      readPublication: async () => null,
      template: resolve(import.meta.dirname, "../../../dashboard/template"),
      fetch: async () => Response.json(snapshot),
    })
    expect(await checkDashboardTarget(id, join(root, "dashboards"))).toBe(true)
    expect(await checkDashboardTarget(crypto.randomUUID(), join(root, "dashboards"))).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("pre-chat publication read uses the captured origin, generation and lifecycle signal", async () => {
  const root = await mkdtemp(join(tmpdir(), "desktop-dashboard-"))
  const controller = new AbortController()
  const reads: unknown[] = []
  try {
    await getDashboardTarget(id, {
      settled: async () => {}, catalog: async () => {},
      status: async () => ({ url: "http://127.0.0.1:32768/app/", generation: 7 }),
      dashboards: () => join(root, "dashboards"), template: resolve(import.meta.dirname, "../../../dashboard/template"),
      signal: controller.signal,
      readPublication: async (input, signal) => { reads.push([input, signal]); return null },
      fetch: async (_url, options) => { expect(options?.signal).toBe(controller.signal); return Response.json(editSnapshot) },
    })
    expect(reads).toEqual([[{ origin: "http://127.0.0.1:32768", generation: 7, binding: snapshot.binding }, controller.signal]])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("cold dashboard waits for captured generation before private read", async () => {
  const root = await mkdtemp(join(tmpdir(), "desktop-dashboard-cold-"))
  const local = Promise.withResolvers<void>()
  const catalog = Promise.withResolvers<void>()
  const settling = Promise.withResolvers<string>()
  const listing = Promise.withResolvers<string>()
  const reads: unknown[] = []
  const requests: unknown[] = []
  const controller = new AbortController()
  const content = JSON.stringify({ format: 1, template: 1, binding: snapshot.binding, title: "Synthetic", parameters: [],
    files: [{ path: "src/main.tsx", encoding: "utf8", content: 'document.body.textContent = "Downloaded"' }] })
  const version = { name: "20261115T120000Z.json", sourceHash: createHash("sha256").update(content).digest("hex") }
  const pending = getDashboardTarget(id, {
    status: async () => ({ url: "http://example.test/app/", generation: 7 }),
    settled: async () => { settling.resolve("settling"); await local.promise },
    catalog: async generation => { expect(generation).toBe(7); listing.resolve("catalog"); await catalog.promise },
    dashboards: () => root, template: resolve(import.meta.dirname, "../../../dashboard/template"), signal: controller.signal,
    readPublication: async (input, signal) => { reads.push([input, signal]); return { content, version } },
    fetch: async url => { requests.push(String(url)); return String(url).includes("/snapshots/") ? Response.json(editSnapshot) : new Response(null, { status: 404 }) },
  }).then(target => ({ target }), error => ({ error }))
  try {
    expect(await Promise.race([settling.promise, pending])).toBe("settling")
    expect(reads).toEqual([])
    local.resolve()
    expect(await Promise.race([listing.promise, pending])).toBe("catalog")
    expect(reads).toEqual([])
    catalog.resolve()
    const result = await pending
    if (!("target" in result)) throw result.error
    expect(await readFile(join(result.target.directory, "src/main.tsx"), "utf8")).toBe('document.body.textContent = "Downloaded"')
    expect(JSON.parse(await readFile(join(result.target.directory, "../control/binding.json"), "utf8")).base).toEqual(version)
    expect(reads).toEqual([[{ origin: "http://example.test", generation: 7, binding: snapshot.binding }, controller.signal]])
    expect(requests.filter(url => String(url).includes("/snapshots/"))).toEqual(["http://example.test/dashboard/snapshots/" + id])
  } finally {
    local.resolve(); catalog.resolve(); await pending
    await rm(root, { recursive: true, force: true })
  }
})

test("cancelling catalog wait never reads publication or falls back to local sources", async () => {
  for (const existing of [false, true]) {
    const root = await mkdtemp(join(tmpdir(), "desktop-dashboard-cancel-"))
    const catalog = Promise.withResolvers<void>()
    const listing = Promise.withResolvers<void>()
    const controller = new AbortController()
    const deps = {
      status: async () => ({ url: "http://example.test/app/", generation: 7 }),
      settled: async () => {}, catalog: async () => {},
      dashboards: () => root, template: resolve(import.meta.dirname, "../../../dashboard/template"),
      readPublication: async () => null, fetch: async () => Response.json(editSnapshot),
    }
    const local = existing ? await getDashboardTarget(id, deps) : undefined
    const before = local && await readFile(join(local.directory, "src/main.tsx"))
    const reads: unknown[] = []
    const pending = getDashboardTarget(id, { ...deps, signal: controller.signal,
      catalog: async () => { listing.resolve(); await catalog.promise },
      readPublication: async input => { reads.push(input); return null },
    }).then(() => "opened", error => error.message)
    try {
      await listing.promise
      controller.abort(new Error("Synthetic cancellation"))
      expect(await Promise.race([pending, Bun.sleep(100).then(() => "still waiting")])).toBe("Synthetic cancellation")
      catalog.resolve()
      await pending
      expect(reads).toEqual([])
      if (local) expect(await readFile(join(local.directory, "src/main.tsx"))).toEqual(before!)
      if (!local) expect(await readdir(root)).toEqual([])
    } finally {
      catalog.resolve(); await pending
      await rm(root, { recursive: true, force: true })
    }
  }
})

test("failed readiness preserves existing sources and base but cannot create a fresh draft", async () => {
  const root = await mkdtemp(join(tmpdir(), "desktop-dashboard-unready-"))
  const deps = {
    status: async () => ({ url: "http://example.test/app/", generation: 7 }),
    settled: async () => {}, catalog: async () => {},
    dashboards: () => root, template: resolve(import.meta.dirname, "../../../dashboard/template"),
    readPublication: async () => null, fetch: async () => Response.json(editSnapshot),
  }
  const unavailable = { ...deps, catalog: async () => { throw Error("LOGINOM_CONNECTION_NOT_READY") },
    readPublication: async () => { throw Error("must not read an unready generation") },
  }
  try {
    await expect(getDashboardTarget(id, unavailable)).rejects.toThrow("LOGINOM_CONNECTION_NOT_READY")
    expect(await readdir(root)).toEqual([])
    const local = await getDashboardTarget(id, deps)
    const before = await readFile(join(local.directory, "src/main.tsx"))
    const base = JSON.parse(await readFile(join(local.directory, "../control/binding.json"), "utf8")).base
    const target = await getDashboardTarget(id, unavailable)
    expect(target.notice?.kind).toBe("publication-check-unavailable")
    expect(await readFile(join(target.directory, "src/main.tsx"))).toEqual(before)
    expect(JSON.parse(await readFile(join(target.directory, "../control/binding.json"), "utf8")).base).toEqual(base)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("a connection replacement during readiness never retargets the captured private read", async () => {
  const root = await mkdtemp(join(tmpdir(), "desktop-dashboard-replaced-"))
  let view = { url: "http://example.test/app/", generation: 7 }
  const reads: unknown[] = []
  try {
    await expect(getDashboardTarget(id, {
      status: async () => view,
      settled: async () => {},
      catalog: async generation => { expect(generation).toBe(7); view = { url: "http://replacement.test/app/", generation: 8 } },
      dashboards: () => root, template: resolve(import.meta.dirname, "../../../dashboard/template"),
      fetch: async () => Response.json(editSnapshot),
      readPublication: async input => {
        reads.push(input)
        if (input.generation !== view.generation) throw Error("LOGINOM_GENERATION_UNAVAILABLE")
        return null
      },
    })).rejects.toThrow("LOGINOM_GENERATION_UNAVAILABLE")
    expect(reads).toEqual([{ origin: "http://example.test", generation: 7, binding: snapshot.binding }])
    expect(await readdir(root)).toEqual([])
  } finally { await rm(root, { recursive: true, force: true }) }
})
