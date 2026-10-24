/** Keep credentials in protected files; only operational settings cross the process boundary. */
export function childEnvironment(env: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(env).flatMap(([key, value]) => {
    if (value === undefined) return []
    if (["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "TZ", "NO_PROXY", "no_proxy"].includes(key)) return [[key, value]]
    if (!/^(?:https?_proxy|all_proxy)$/i.test(key)) return []
    const proxy = URL.parse(value)
    return proxy?.hostname && !proxy.username && !proxy.password && !proxy.search && !proxy.hash && ["", "/"].includes(proxy.pathname)
      ? [[key, value]] : []
  }))
}
