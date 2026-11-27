// Inspect the existing managed Loginom window without changing its workspace.
export async function observePackages(page, binding, packagePath) {
  const observation = page.evaluate(async ({ origin, account, packagePath, deadline }) => {
    const app = globalThis.bg?.app
    const form = app?.Application?.FInstance?.FMainForm
    const map = form?.FMapTree
    const connection = map?.FServerConnection
    const session = connection?.Session
    const packages = map?.PackageNodes
    const bound = () => Date.now() < deadline && location.origin === origin && globalThis.bg?.app === app
      && app?.Version === "7.4.2" && app.Application.FInstance?.FMainForm === form
      && form.FMapTree === map && form.FReconnecting === false && map.FServerConnection === connection
      && connection.Connected === true && connection.UserName === account && session && connection.Session === session
      && map.PackageNodes === packages
    if (!bound() || !Number.isSafeInteger(packages?.Count) || packages.Count < 0 || packages.Count > 256) return null

    const pathOf = (node) => {
      if (!node?.Package || typeof node.PackageFileName !== "string") return null
      const path = "/" + node.PackageFileName.replaceAll("\\", "/").split("/").filter(Boolean).join("/")
      if (path.length > 1024 || !/^\/(?:[^/\x00-\x1f]+\/)*[^/\x00-\x1f]+\.lgp$/i.test(path)
        || path.split("/").some((part) => part === "." || part === "..")) return null
      return path
    }
    const observed = []
    for (let i = 0; i < packages.Count; i++) {
      const node = packages.Items(i)
      const path = pathOf(node)
      if (path && typeof node.ReadOnly === "boolean") observed.push({ index: i, node, path, readOnly: node.ReadOnly })
    }
    if (!packagePath) return { packages: observed.map(({ path, readOnly }) => ({ path, readOnly })) }

    const matches = observed.filter(({ path }) => path === packagePath)
    if (matches.length !== 1) return null
    const { index, node, path, readOnly } = matches[0]
    const stillOpen = () => bound() && index < packages.Count
      && packages.Items(index) === node && pathOf(node) === path && node.ReadOnly === readOnly
    let lockMarker = "unknown"
    if (readOnly) {
      const slash = path.lastIndexOf("/")
      // Linux Loginom uses a dot-prefixed sidecar. Its presence is evidence
      // of a lock marker, and cannot identify a user or prove a live session.
      const marker = path.slice(0, slash + 1) + "." + path.slice(slash + 1) + ".lck"
      try {
        const storage = await session.get_FileStorage()
        if (!stillOpen()) return null
        const exists = await storage.FileExists(marker)
        if (typeof exists === "boolean") lockMarker = exists ? "present" : "not_observed"
      } catch { /* Storage visibility can be restricted independently of the open package. */ }
    }
    return stillOpen() ? { packages: [{ path, readOnly }], lockMarker } : null
  }, { ...binding, packagePath, deadline: Date.now() + 4_000 })
  let timer
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), 4_000) })
  try {
    return await Promise.race([observation, timeout])
  } finally {
    clearTimeout(timer)
  }
}
