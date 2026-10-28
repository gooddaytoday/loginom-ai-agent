import { describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { existsSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { trackedSnapshot } from "./tracked"

// Guards for the failure that renaming or moving a package produces silently: CI, turbo and build scripts keep
// pointing at the old location. The sync procedure (docs/upstream-sync/procedure.md) runs this file after a merge.
const root = resolve(import.meta.dir, "../../..")
const { paths: tracked, read } = trackedSnapshot(root)
const isDir = (path: string) => existsSync(path) && statSync(path).isDirectory()

// Workspace packages as the root manifest declares them.
const workspaceGlobs: string[] = JSON.parse(read("package.json")).workspaces.packages
const workspaces = new Map<string, string>() // package name -> directory
for (const path of tracked.filter((item) => item.endsWith("/package.json") && !item.includes("node_modules"))) {
  const dir = path.slice(0, -"/package.json".length)
  if (!workspaceGlobs.some((glob) => new Bun.Glob(glob).match(dir))) continue
  workspaces.set(JSON.parse(read(path)).name, dir)
}
const rootName: string = JSON.parse(read("package.json")).name

// Historical or generated material keeps the names that were valid when it was written.
const HISTORICAL = [
  "script/migration/",
  "docs/superpowers/",
  "docs/archive/",
  "docs/node-development/",
  "docs/migration/",
  "docs/upstream-sync/",
  "scripts/upstream-sync/",
  "evals/docs/",
]
const historical = (path: string) =>
  HISTORICAL.some((prefix) => path.startsWith(prefix)) ||
  /(^|\/)(reports|history)\//.test(path) ||
  path === "WINDOWS_IMPLEMENTATION_PLAN.md" ||
  path === "bun.lock"
const CODE = /\.(ts|tsx|js|mjs|cjs|json|jsonc|ya?ml|ps1|sh|nix|toml)$/
const checked = tracked.filter((path) => CODE.test(path) && !historical(path) && !path.includes("/generated"))
// Build, release and CI tooling: the code that locates other packages by path. Application sources are covered by typecheck;
// fixtures that spell out "../" on purpose (path-traversal tests) and vendored services are not tooling.
const TOOLING =
  /^(\.github\/|script\/|scripts\/|nix\/|patches\/|github\/|turbo\.json$|package\.json$|evals\/(src|test|script)\/|packages\/[^/]+\/(scripts?\/|package\.json$|[^/]*\.config\.ts$|electron\.vite\.config\.ts$)|packages\/loginom-host\/(src|test)\/)/
const tooling = checked.filter((path) => TOOLING.test(path) && !path.includes("/node_modules/"))

describe("workspace packages", () => {
  test("the agent package keeps the upstream directory", () => {
    expect(workspaces.get("opencode")).toBe("packages/opencode")
    expect(isDir(join(root, "packages/agent"))).toBe(false)
  })

  test("turbo task keys name existing workspace packages", () => {
    const tasks = Object.keys(JSON.parse(read("turbo.json")).tasks)
    const dangling = tasks.filter((key) => key.includes("#") && !workspaces.has(key.split("#")[0]!))
    expect(dangling).toEqual([])
  })

  test("--filter arguments in CI and scripts name existing workspace packages", () => {
    const dangling: string[] = []
    for (const path of checked.filter((item) => /^(\.github\/|script\/|scripts\/|nix\/|packages\/[^/]+\/scripts?\/)/.test(item))) {
      for (const match of read(path).matchAll(/--filter[ =]+['"]?([^\s'"`)]+)/g)) {
        const name = match[1]!.replace(/^!/, "")
        if (name.includes("${") || name.includes("*") || name.startsWith("$")) continue
        // git clone and fetch take object filters (blob:none, tree:0); they are not workspace names.
        if (/^(blob|tree|object|sparse|combine):/.test(name)) continue
        if (name.startsWith("./")) {
          if (!isDir(join(root, name))) dangling.push(`${path}: --filter ${name}`)
          continue
        }
        if (!workspaces.has(name) && name !== rootName) dangling.push(`${path}: --filter ${name}`)
      }
    }
    expect(dangling).toEqual([])
  })
})

describe("CI triggers", () => {
  const workflows = tracked.filter((path) => /^\.github\/workflows\/.*\.ya?ml$/.test(path))

  test("path filters match tracked files, so a trigger cannot silently stop firing", () => {
    const dead: string[] = []
    for (const path of workflows) {
      const doc: any = (Bun as any).YAML.parse(read(path))
      const on = doc.on ?? {}
      for (const event of Object.values<any>(typeof on === "object" ? on : {})) {
        for (const pattern of (event?.paths ?? []) as string[]) {
          if (pattern.startsWith("!")) continue
          const glob = new Bun.Glob(pattern)
          if (!tracked.some((file) => glob.match(file))) dead.push(`${path}: ${pattern}`)
        }
      }
    }
    expect(dead).toEqual([])
  })

  test("working-directory points at existing directories", () => {
    const missing: string[] = []
    for (const path of workflows) {
      const text = read(path)
      // A checkout step with `path:` creates that directory at run time.
      const checkouts = new Set([...text.matchAll(/^\s*path:\s*([^\s#]+)/gm)].map((m) => m[1]!.replace(/^["']|["']$/g, "")))
      for (const match of text.matchAll(/working-directory:\s*([^\s#]+)/g)) {
        const dir = match[1]!.replace(/^["']|["']$/g, "")
        if (dir.includes("${{") || dir === ".") continue
        if ([...checkouts].some((root) => dir === root || dir.startsWith(root + "/"))) continue
        if (!isDir(join(root, dir))) missing.push(`${path}: ${dir}`)
      }
    }
    expect(missing).toEqual([])
  })
})

describe("path literals in build and CI code", () => {
  const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".mjs", ".json", "/index.ts", "/index.tsx", "/index.js"]
  const exists = (base: string) => EXTENSIONS.some((ext) => existsSync(base + ext))
  // Names a sibling-package reference can use: current workspace directories and the legacy agent directory.
  const siblingNames = new Set([...workspaces.values()].map((dir) => dir.split("/").at(-1)!).concat("agent"))
  // Strings that look like packages/<name> but are not repository paths (upstream changelog categories, fixtures).
  // electron.vite.config.ts: publicDir is relative to the renderer root (src/renderer), not to the config file.
  const NOT_PATHS = new Set([
    "script/raw-changelog.ts: packages/extensions",
    "packages/desktop/electron.vite.config.ts: ../../../app",
  ])
  const fixture = (path: string) => /(^|\/)(fixtures?|__snapshots__)\//.test(path)

  test("packages/<name> and sibling-package references resolve to existing paths", () => {
    const missing = new Set<string>()
    for (const path of tooling.filter((item) => !fixture(item))) {
      const ancestors = dirname(path)
        .split("/")
        .filter((part) => part && part !== ".")
        .map((_, index, parts) => join(root, ...parts.slice(0, parts.length - index)))
        .concat(root)
      for (const line of read(path).split("\n")) {
        if (line.length > 2000) continue
        // packages/<name> written out, or built from segments: "packages", "<name>". URLs are other repositories.
        for (const match of line.matchAll(/packages\/([A-Za-z0-9_][A-Za-z0-9_-]*)(?=[/"'`\s)]|$)/g)) {
          if (line.slice(Math.max(0, match.index! - 160), match.index!).includes("http")) continue
          if (!isDir(join(root, "packages", match[1]!))) missing.add(`${path}: packages/${match[1]}`)
        }
        for (const match of line.matchAll(/["']packages["']\s*,\s*["']([A-Za-z0-9_][A-Za-z0-9_-]*)["']/g)) {
          if (!isDir(join(root, "packages", match[1]!))) missing.add(`${path}: "packages", "${match[1]}"`)
        }
        // ../<sibling>/... resolved against the file, its package, or any directory between them
        for (const match of line.matchAll(/["'`]((?:\.\.\/)+)([A-Za-z0-9_][A-Za-z0-9_-]*)(?=\/|["'`])/g)) {
          if (!siblingNames.has(match[2]!)) continue
          const rel = match[1]! + match[2]!
          if (!ancestors.some((base) => exists(resolve(base, rel)))) missing.add(`${path}: ${rel}`)
        }
        // { package: "<dir>" } tables that are joined with "packages" later
        for (const match of line.matchAll(/\bpackage:\s*["']([A-Za-z0-9_-]+)["']/g)) {
          if (isDir(join(root, "packages", match[1]!)) || workspaces.has(match[1]!)) continue
          if (siblingNames.has(match[1]!)) missing.add(`${path}: package: "${match[1]}"`)
        }
      }
    }
    expect([...missing].filter((item) => !NOT_PATHS.has(item)).sort()).toEqual([])
  }, 60_000)

  test("the legacy packages/agent directory is not referenced outside historical material", () => {
    // This file names the legacy directory on purpose.
    const stale = checked.filter((path) => path !== "packages/product/test/repo-paths.test.ts" && /packages\/agent(?![\w-])/.test(read(path)))
    expect(stale).toEqual([])
  }, 60_000)
})

describe("upstream-sync documentation", () => {
  // The catalog compares against the upstream revision recorded in catalog.json; a shallow CI checkout does not have it.
  const against: string = JSON.parse(read("docs/upstream-sync/catalog.json")).against
  const hasBase = (() => {
    try {
      execFileSync("git", ["cat-file", "-e", `${against}^{commit}`], { cwd: root, stdio: "ignore" })
      return true
    } catch {
      return false
    }
  })()

  test.skipIf(!hasBase)("catalog.json describes every file in which the fork differs from upstream", () => {
    execFileSync("python3", ["-I", "scripts/upstream-sync/catalog-check.py"], { cwd: root, stdio: "pipe" })
  }, 60_000)

  const expand = (token: string): string[] => {
    const match = token.match(/\{([^{}]+)\}/)
    if (!match) return [token]
    return match[1]!.split(",").flatMap((alternative) => expand(token.replace(match[0], alternative)))
  }

  test("files named in guarantees.md and the scripts it relies on exist", () => {
    const missing: string[] = []
    for (const match of read("docs/upstream-sync/guarantees.md").matchAll(/`((?:packages|scripts)\/[^`\s]+)`/g)) {
      if (/[*<>]/.test(match[1]!)) continue
      for (const path of expand(match[1]!)) if (!existsSync(join(root, path))) missing.push(path)
    }
    expect(missing).toEqual([])
  })
})
