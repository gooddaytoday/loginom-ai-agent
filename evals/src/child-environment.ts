/** Keep credentials in protected files; only operational settings cross the process boundary. */
export function childEnvironment(env: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(env).flatMap(([key, value]) =>
    value !== undefined && ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "TZ"].includes(key) ? [[key, value]] : []))
}
