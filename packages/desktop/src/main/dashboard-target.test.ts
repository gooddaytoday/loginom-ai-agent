import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { checkDashboardTarget, getDashboardTarget } from "./dashboard-target"

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

test("consumes the requested one-time snapshot from the configured stand", async () => {
  const root = await mkdtemp(join(tmpdir(), "desktop-dashboard-"))
  const requests: [unknown, RequestInit | undefined][] = []
  try {
    const target = await getDashboardTarget(id, {
      status: async () => ({ url: "http://127.0.0.1:32768/app/?x=1", generation: 2 }),
      dashboards: () => join(root, "dashboards"),
      template: resolve(import.meta.dirname, "../../../dashboard/template"),
      fetch: async (url, init) => {
        requests.push([url, init])
        return Response.json(snapshot)
      },
    })
    expect(requests).toEqual([["http://127.0.0.1:32768/dashboard/snapshots/" + id, { redirect: "error" }]])
    expect(target).toMatchObject({ nodeName: snapshot.nodeName, action: "create", fresh: true })
    expect(target.directory.startsWith(join(root, "dashboards") + "/")).toBe(true)
    expect(JSON.parse(await readFile(join(target.directory, "sample.json"), "utf8"))).toEqual(snapshot.sample)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("an unconfigured stand fails before fetching a snapshot", async () => {
  const requests: unknown[] = []
  await expect(
    getDashboardTarget(id, {
      status: async () => ({ url: "http://127.0.0.1:32768/app/?x=1", generation: 0 }),
      dashboards: () => "/unused/dashboards",
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
      status: async () => ({ url: "http://127.0.0.1:32768/app/?x=1", generation: 2 }),
      dashboards: () => "/unused/dashboards",
      template: resolve(import.meta.dirname, "../../../dashboard/template"),
      fetch: async () => new Response(null, { status: 404 }),
    }),
  ).rejects.toThrow("DASHBOARD_SNAPSHOT_UNAVAILABLE")
})

test("checks the prepared local folder without consuming a snapshot again", async () => {
  const root = await mkdtemp(join(tmpdir(), "desktop-dashboard-"))
  try {
    await getDashboardTarget(id, {
      status: async () => ({ url: "http://127.0.0.1:32768/app/?x=1", generation: 2 }),
      dashboards: () => join(root, "dashboards"),
      template: resolve(import.meta.dirname, "../../../dashboard/template"),
      fetch: async () => Response.json(snapshot),
    })
    expect(await checkDashboardTarget(id, join(root, "dashboards"))).toBe(true)
    expect(await checkDashboardTarget(crypto.randomUUID(), join(root, "dashboards"))).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
