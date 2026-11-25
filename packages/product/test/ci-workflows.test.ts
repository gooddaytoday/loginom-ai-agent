import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"
import { trackedSnapshot } from "./tracked"

// A fork must not run upstream automation: runners it does not have queue forever, triage jobs close the fork's issues
// and pull requests, deploys fail without secrets. Every workflow is either product-owned (listed here) or has every job
// behind the upstream repository condition. A workflow that arrives with a sync fails here until someone decides.
const { paths: tracked, read } = trackedSnapshot(resolve(import.meta.dir, "../../.."))

const UPSTREAM = "github.repository == 'anomalyco/opencode'"

// Product-owned workflows, kept and fixed by the B5.1 tasks.
const PRODUCT = new Set([
  "check-bot-scope",
  "check-process-daemon",
  "check-test",
  "check",
  "loginom-client-full",
  "loginom-macos",
  "loginom-windows",
  "secrets",
  "windows-native-check",
])
// Upstream workflows that are not gated job by job: `bot-nix-hashes` starts only on a push to `dev`, and its publish job is gated.
const BRANCH_ONLY = new Set(["bot-nix-hashes"])

type Job = { if?: string | boolean; needs?: string | string[] }

const workflows = tracked.filter((path) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path))
const nameOf = (path: string) => path.replace(/^.*\//, "").replace(/\.ya?ml$/, "")

function gated(jobs: Record<string, Job>, name: string, seen = new Set<string>()): boolean {
  if (seen.has(name)) return false
  const job = jobs[name]!
  const condition = String(job.if ?? "").replace(/^\$\{\{\s*|\s*\}\}$/g, "")
  if (condition === UPSTREAM || condition.startsWith(UPSTREAM + " &&")) return true
  // A job whose dependencies are all gated is skipped together with them.
  const needs = [job.needs ?? []].flat()
  return needs.length > 0 && needs.every((need) => gated(jobs, need, new Set(seen).add(name)))
}

describe("upstream workflows", () => {
  test("every workflow is product-owned or fully gated to the upstream repository", () => {
    const open = workflows.flatMap((path) => {
      if (PRODUCT.has(nameOf(path)) || BRANCH_ONLY.has(nameOf(path))) return []
      const jobs: Record<string, Job> = (Bun as any).YAML.parse(read(path)).jobs
      return Object.keys(jobs)
        .filter((name) => !gated(jobs, name))
        .map((name) => `${path}: ${name}`)
    })
    expect(open).toEqual([])
  })

  test("the product list names existing workflows", () => {
    const names = new Set(workflows.map(nameOf))
    expect([...PRODUCT, ...BRANCH_ONLY].filter((name) => !names.has(name))).toEqual([])
  })
})
