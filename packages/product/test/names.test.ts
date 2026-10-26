import { describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"

// Naming policy (docs/upstream-sync/adr-0001-modular-integration.md): packages that exist in OpenCode keep the
// upstream names so that a merge of an upstream tag does not conflict on every import and manifest. Packages that
// exist only in this fork keep the @loginom-ai-agent scope. External names (LOGINOM_AI_AGENT_*, executable, app ids)
// are product identity and are covered by identity.test.ts and the compat snapshot.
const root = resolve(import.meta.dir, "../../..")
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 29 })
  .split("\0")
  .filter(Boolean)
const read = (path: string) => readFileSync(join(root, path), "utf8")

const FORK_ONLY = ["product", "loginom-host", "runtime", "site", "evals"]
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
    const pattern = new RegExp(`@loginom-ai-agent/(?!(?:${FORK_ONLY.join("|")})(?![A-Za-z0-9_-]))[A-Za-z0-9_-]+`)
    const offenders = tracked
      .filter((path) => /\.(ts|tsx|js|mjs|json|ya?ml)$/.test(path))
      .filter((path) => !/^(docs\/(superpowers|archive|node-development|migration|upstream-sync)|script\/migration|scripts\/upstream-sync|evals\/docs)\//.test(path))
      .filter((path) => path !== "bun.lock" && !/(^|\/)(reports|history)\//.test(path))
      .filter((path) => pattern.test(read(path)))
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
