import { delimiter, join } from "node:path"

// stage-resources.ts places the pinned ripgrep here, alone, so PATH exposes only rg.
export const ripgrepDirectory = "ripgrep"

/**
 * Appends the bundled ripgrep directory to PATH so the agent's glob/grep find
 * rg before attempting a runtime download. A system rg earlier on PATH still wins.
 */
export function withBundledRipgrep<T extends Record<string, string | undefined>>(env: T, resources: string): T {
  const key = Object.keys(env).find((name) => name.toUpperCase() === "PATH") ?? "PATH"
  const directory = join(resources, ripgrepDirectory)
  const entries = (env[key] ?? "").split(delimiter).filter(Boolean)
  if (!entries.includes(directory)) entries.push(directory)
  ;(env as Record<string, string | undefined>)[key] = entries.join(delimiter)
  return env
}
