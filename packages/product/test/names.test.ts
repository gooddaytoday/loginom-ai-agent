import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"
import { trackedSnapshot } from "./tracked"

// Naming policy (docs/upstream-sync/adr-0001-modular-integration.md): packages that exist in OpenCode keep the
// upstream names so that a merge of an upstream tag does not conflict on every import and manifest. Packages that
// exist only in this fork keep the @loginom-ai-agent scope. External names (LOGINOM_AI_AGENT_*, executable, app ids)
// are product identity and are covered by identity.test.ts and the compat snapshot.
const root = resolve(import.meta.dir, "../../..")
const { paths: tracked, read } = trackedSnapshot(root)

const FORK_ONLY = ["product", "loginom-host", "runtime", "site", "evals"]

const NAME_CHAR = "[A-Za-z0-9_-]"
const pluginName = "@loginom-ai-agent/plugin"
const pluginInstallName = new RegExp(`${pluginName}(?!${NAME_CHAR})`, "g")
const pluginInstallFiles = new Set([
  "packages/opencode/src/product/installation.ts",
  "packages/opencode/test/product/plugin-dependency.test.ts",
  "packages/product/test/names.test.ts",
])
const forkScopeOutsideForkOnly = new RegExp(
  `@loginom-ai-agent/(?!(?:${FORK_ONLY.join("|")})(?!${NAME_CHAR}))${NAME_CHAR}+`,
)
const withoutPluginInstallName = (text: string) => text.replaceAll(pluginInstallName, "")
const requestsPluginInstallName = (text: string) => text.search(pluginInstallName) !== -1
const usesForkScopeForUpstream = (text: string) => forkScopeOutsideForkOnly.test(text)
const manifests = tracked.filter(
  (path) => /^(packages|apps|evals)\/.*package\.json$/.test(path) || path === "evals/package.json",
).filter((path) => !path.includes("node_modules") && !path.startsWith("packages/loginom-runtime/client/"))
const names = manifests.map((path) => ({ path, name: JSON.parse(read(path)).name as string }))

describe("package names", () => {
  test("upstream packages keep upstream names, fork packages keep the fork scope", () => {
    const offenders = names.filter(({ name }) => {
      if (name === "opencode" || name.startsWith("@opencode-ai/")) return false
      return !FORK_ONLY.some((pkg) => name === `@loginom-ai-agent/${pkg}`)
    })
    expect(offenders).toEqual([])
  })

  test("the agent package is called opencode and lives in packages/opencode", () => {
    expect(names.find(({ name }) => name === "opencode")?.path).toBe("packages/opencode/package.json")
  })

  test("no import or dependency uses the fork scope for an upstream package", () => {
    const offenders = tracked
      .filter((path) => /\.(ts|tsx|js|mjs|json|ya?ml)$/.test(path))
      .filter((path) => !/^(docs\/(superpowers|archive|node-development|migration|upstream-sync)|script\/migration|scripts\/upstream-sync|evals\/docs)\//.test(path))
      .filter((path) => path !== "bun.lock" && !/(^|\/)(reports|history)\//.test(path))
      .filter((path) => usesForkScopeForUpstream(pluginInstallFiles.has(path) ? withoutPluginInstallName(read(path)) : read(path)))
    expect(offenders).toEqual([])
  })

  test("the install seam may name only the public plugin package, not a longer name that starts with it", () => {
    const named = (...names: string[]) => usesForkScopeForUpstream(withoutPluginInstallName(names.join("\n")))
    expect(named(pluginName)).toBe(false)
    expect(named(`${pluginName}/server`)).toBe(false)
    expect(named(`${pluginName}-next`)).toBe(true)
    expect(named(`${pluginName}_v2`)).toBe(true)
    expect(named(pluginName, `${pluginName}-next`)).toBe(true)
  })

  test("the public plugin name is requested only by the background install seam and its test", () => {
    const requesters = tracked
      .filter((path) => /\.(ts|tsx|js|mjs)$/.test(path))
      .filter((path) => !/^(docs\/|scripts\/upstream-sync\/)/.test(path) && path !== "packages/product/test/names.test.ts")
      .filter((path) => requestsPluginInstallName(read(path)))
    expect(requesters.toSorted()).toEqual([
      "packages/opencode/src/product/installation.ts",
      "packages/opencode/test/product/plugin-dependency.test.ts",
    ])
  })

  test("a longer package name that starts with the public plugin name is not a request for it", () => {
    expect(requestsPluginInstallName(`${pluginName}-next`)).toBe(false)
    expect(requestsPluginInstallName(`${pluginName}-next\n${pluginName}`)).toBe(true)
    expect(requestsPluginInstallName(pluginName)).toBe(true)
  })

  test("the fork scope is not spelled as a separate path segment or string", () => {
    // path.join(dir, "node_modules", "@loginom-ai-agent", "plugin") names a package directory without the "/" the import
    // check looks for; a fixture built that way stops matching the upstream package name it is meant to stand for.
    const offenders = tracked
      .filter((path) => /\.(ts|tsx|js|mjs|json|ya?ml)$/.test(path))
      .filter((path) => !/^(docs\/|script\/migration\/|scripts\/upstream-sync\/|evals\/docs\/)/.test(path) && !/(^|\/)(reports|history)\//.test(path))
      .filter((path) => path !== "bun.lock" && path !== "packages/product/src/index.ts" && path !== "packages/product/test/names.test.ts")
      .filter((path) => /["'`]@loginom-ai-agent["'`]/.test(read(path)))
    expect(offenders).toEqual([])
  })

  test("Effect service keys use the upstream @opencode/ prefix", () => {
    const offenders = tracked
      .filter((path) => /^packages\/.*\.(ts|tsx)$/.test(path) && !path.includes("/generated"))
      .filter((path) => /["']@loginom-ai-agent\/[A-Z]/.test(read(path)))
    expect(offenders).toEqual([])
  })
})

describe("environment variable names", () => {
  // The only OPENCODE_* names the product may mention are keys that third-party providers define.
  const ALLOWED = new Set(["OPENCODE_API_KEY", "OPENCODE_GO_API_KEY"])
  const SOURCES =
    /^(packages\/(opencode|core|desktop|loginom-host|loginom-runtime|product|app|cli|server|schema)\/(src|script|scripts)\/)/

  test("source code reads no OPENCODE_* variable except third-party provider keys", () => {
    const offenders: string[] = []
    for (const path of tracked.filter((item) => SOURCES.test(item) && /\.(ts|tsx|js|mjs)$/.test(item))) {
      for (const match of read(path).matchAll(/\bOPENCODE_[A-Z0-9_]+/g)) {
        if (!ALLOWED.has(match[0])) offenders.push(`${path}: ${match[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
