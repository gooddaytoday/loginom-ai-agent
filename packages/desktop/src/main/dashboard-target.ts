import { dirname, resolve } from "node:path"

export async function getDashboardTarget(
  id: string,
  read: (url: string, options: RequestInit) => Promise<Response> = fetch,
) {
  if (typeof id !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) {
    throw new Error("Invalid dashboard ID")
  }
  const response = await read("http://127.0.0.1:32768/dashboard/targets/" + id, { redirect: "error" })
  if (!response.ok) throw new Error("Dashboard snapshot unavailable")
  const target: { id?: unknown; key?: unknown; nodeName?: unknown; sourceDir?: unknown } | null = await response.json()
  if (
    target?.id !== id ||
    typeof target.nodeName !== "string" ||
    !target.nodeName.trim() ||
    typeof target.key !== "string" ||
    !/^[a-f0-9]{64}$/.test(target.key) ||
    typeof target.sourceDir !== "string" ||
    target.sourceDir.includes("\0") ||
    resolve(target.sourceDir) !== target.sourceDir ||
    !target.sourceDir.endsWith("/dashboard/apps/" + target.key)
  ) {
    throw new Error("Invalid dashboard snapshot")
  }
  return { nodeName: target.nodeName, directory: dirname(dirname(dirname(target.sourceDir))) }
}
