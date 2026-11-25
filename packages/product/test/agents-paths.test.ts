import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { trackedSnapshot } from "./tracked"

// repo-paths.test.ts checks build and CI code only. Module AGENTS.md files name paths of their own; after a package
// moves they keep pointing at the old place, and the next agent reads them as fact.
const root = resolve(import.meta.dir, "../../..")
const { paths: tracked, read } = trackedSnapshot(root)
const guides = tracked.filter((path) => /(^|\/)AGENTS\.md$/.test(path) && !path.includes("node_modules/"))

// Keys are "<AGENTS.md>: <path as written>"; the value is why the mention is not a path of this repository.
const NOT_PATHS: Record<string, string> = {
  "dashboard/AGENTS.md: dashboard/apps": "directory of the Loginom Server stand, not of this repository",
  "dashboard/AGENTS.md: src/loginom.ts": "file of a published dashboard application; the repository copy is packages/dashboard/src/sdk/loginom.ts",
  "packages/dashboard/AGENTS.md: dist/server.mjs": "build output of the dashboard image",
  "packages/dashboard/AGENTS.md: dist/shell.js": "build output of the dashboard image",
  "packages/dashboard/AGENTS.md: src/main.tsx": "entry file of a published dashboard application, not of this package",
  "packages/dashboard/AGENTS.md: builds/state.json": "state file in the runtime data directory",
  "packages/gui-plugins/AGENTS.md: i18n/en.ts": "file every plugin has in its own directory (src/<plugin>/i18n/en.ts)",
  "packages/loginom-host/AGENTS.md: dashboard/template": "directory inside the staged resource tree, not in the repository",
}

const FILE_EXTENSION = /\.(ts|tsx|js|mjs|cjs|json|jsonc|md|mdx|ya?ml|ps1|sh|py|nix|toml|sql|css|html)$/
const REPO_ROOTS = /^(packages|docs|scripts?|evals|services|dashboard|\.github|\.claude|nix|patches|github|spike)\//

// Backtick spans and markdown link targets that look like a path inside this repository.
function mentions(text: string) {
  const spans = [...text.matchAll(/`([^`\n]+)`/g)].map((match) => match[1]!)
  const links = [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]!)
  return [...new Set([...spans.filter(plausible), ...links.filter((link) => !/^(https?:|mailto:|#)/.test(link))])]
}

function plausible(span: string) {
  if (/[\s*<>{}$|=~@]|^https?:|^-|^\/|\.\.\.|:\/\//.test(span)) return false
  return REPO_ROOTS.test(span.replace(/^\.\//, "")) || (span.includes("/") && FILE_EXTENSION.test(span.split(":")[0]!))
}

function resolves(guide: string, written: string) {
  const path = written.replace(/#.*$/, "").replace(/:\d+(-\d+)?$/, "").replace(/\/$/, "")
  if (!path) return true
  // A guide names paths from the repository root, or from its own directory, an ancestor of it or the src/ of one.
  const parts = dirname(guide) === "." ? [] : dirname(guide).split("/")
  return parts
    .map((_, index) => join(root, ...parts.slice(0, parts.length - index)))
    .concat(root)
    .flatMap((dir) => [dir, join(dir, "src")])
    .some((dir) => existsSync(join(dir, path)))
}

describe("AGENTS.md paths", () => {
  test("every mentioned repository path exists", () => {
    const missing = guides.flatMap((guide) =>
      mentions(read(guide))
        .filter((written) => !(`${guide}: ${written}` in NOT_PATHS) && !resolves(guide, written))
        .map((written) => `${guide}: ${written}`),
    )
    expect(missing).toEqual([])
  })

  test("exceptions still point at a mention", () => {
    const stale = Object.keys(NOT_PATHS).filter((key) => {
      const split = key.indexOf(": ")
      const guide = key.slice(0, split)
      return !guides.includes(guide) || !mentions(read(guide)).includes(key.slice(split + 2))
    })
    expect(stale).toEqual([])
  })

  test("every exception states a reason", () => {
    expect(Object.entries(NOT_PATHS).filter(([, reason]) => !reason.trim())).toEqual([])
  })
})
