import { expect, test } from "bun:test"
import { getDashboardTarget } from "./dashboard-target"

const id = "3b4aa44a-5c86-4798-aa7e-4f16a59e9c6b"
const key = "a".repeat(64)
const snapshot = { id, key, sourceDir: "/tmp/project/dashboard/apps/" + key, nodeName: "По убыванию ROI" }

test("reads only the requested local snapshot and opens its project", async () => {
  const requests: [string, RequestInit | undefined][] = []
  const target = await getDashboardTarget(id, async (url, init) => {
    requests.push([url, init])
    return Response.json(snapshot)
  })
  expect(requests).toEqual([["http://127.0.0.1:32768/dashboard/targets/" + id, { redirect: "error" }]])
  expect(target).toEqual({ nodeName: snapshot.nodeName, directory: "/tmp/project" })
})

test("rejects a non-UUID before requesting a target", async () => {
  let requested = false
  await expect(
    getDashboardTarget("../current", async () => {
      requested = true
      return Response.json(snapshot)
    }),
  ).rejects.toThrow()
  expect(requested).toBe(false)
})

test("rejects expired or inconsistent snapshots before opening a project", async () => {
  for (const response of [
    Response.json(snapshot, { status: 404 }),
    Response.json({ ...snapshot, id: crypto.randomUUID() }),
    Response.json({ ...snapshot, nodeName: " " }),
    Response.json({ ...snapshot, sourceDir: "relative/dashboard/apps/" + key }),
    Response.json({ ...snapshot, sourceDir: "/tmp/project/../another/dashboard/apps/" + key }),
    Response.json({ ...snapshot, sourceDir: "/tmp/project/dashboard/apps/" + "b".repeat(64) }),
  ]) {
    await expect(getDashboardTarget(id, async () => response)).rejects.toThrow()
  }
})
