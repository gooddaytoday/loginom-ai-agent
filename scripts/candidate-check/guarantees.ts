#!/usr/bin/env bun
// B6.2a: guarantees G1-G6 on the current tree, with a numbers table, then mutations (red -> revert -> green).
//
//   bun scripts/candidate-check/guarantees.ts [run|mutate|all] [--out <dir>] [--only <id,id>]
//
// Needs Bun 1.4.4 first in PATH, `LOGINOM_AI_AGENT_TEST_NODE=<node 24.19.0>/bin/node`, `npm ci` in
// packages/loginom-runtime/client and packages/dashboard/template (docs/upstream-sync/guarantees.md, "Как запускать"),
// and `xvfb-run`. Everything runs with HOME, XDG_* and TMPDIR in a temporary root: real profile directories are not touched.
// Mutations edit the files of THIS tree and restore them with `git checkout`; run on a tree with no uncommitted changes.
// Logs go to --out (default: /root/.local/share/loginom-evidence/b62a/<short SHA>) without the environment.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const repo = resolve(import.meta.dir, "../..")
const argv = process.argv.slice(2)
const mode = argv.find((item) => ["run", "mutate", "all"].includes(item)) ?? "all"
const option = (name: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)
const only = argv.includes("--only") ? new Set(option("--only")!.split(",")) : undefined

const git = (...args: string[]) => Bun.spawnSync(["git", ...args], { cwd: repo }).stdout.toString().trim()
const sha = git("rev-parse", "HEAD")
const out = option("--out") ?? `/root/.local/share/loginom-evidence/b62a/${sha.slice(0, 10)}`
mkdirSync(out, { recursive: true })

const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
if (!node) throw new Error("set LOGINOM_AI_AGENT_TEST_NODE to the Node 24.19.0 binary")
if (git("status", "--porcelain")) throw new Error("the tree has uncommitted changes")

const sandbox = mkdtempSync(join(tmpdir(), "b62a-"))
const env = {
  ...process.env,
  HOME: join(sandbox, "home"),
  XDG_DATA_HOME: join(sandbox, "data"),
  XDG_CONFIG_HOME: join(sandbox, "config"),
  XDG_CACHE_HOME: join(sandbox, "cache"),
  XDG_STATE_HOME: join(sandbox, "state"),
  TMPDIR: join(sandbox, "tmp"),
}
for (const dir of [env.HOME, env.XDG_DATA_HOME, env.XDG_CONFIG_HOME, env.XDG_CACHE_HOME, env.XDG_STATE_HOME, env.TMPDIR])
  mkdirSync(dir, { recursive: true })

type Command = { id: string; g: string; cwd: string; cmd: string[]; note?: string }
const test = (id: string, g: string, cwd: string, ...files: string[]): Command => ({
  id,
  g,
  cwd,
  cmd: ["bun", "test", ...files],
})

// Commands of "Как запускать" in guarantees.md; keep both lists equal.
const commands: Command[] = [
  test("product", "G2+names+repo-paths", "packages/product"),
  test("cli-identity", "G2", "packages/cli", "test/flag-identity.test.ts", "test/service-identity.test.ts"),
  test("loginom-agent", "G1+G4+G6", "packages/loginom-agent"),
  test("server-access", "G1+G6", "packages/server", "test/loginom-access.test.ts"),
  test("server-dashboard-files", "G1", "packages/server", "test/loginom-dashboard-files.test.ts"),
  test("server-local-file", "G1", "packages/server", "test/loginom-local-file.test.ts"),
  test("server-package-docs", "G1", "packages/server", "test/loginom-package-docs.test.ts"),
  test("server-dock-catalog", "G1", "packages/server", "test/loginom-dock-catalog.test.ts"),
  test("server-host-lease", "G3+G4", "packages/server", "test/loginom-host-lease.test.ts"),
  test("cli-host", "G3", "packages/cli", "test/loginom-host.test.ts"),
  test("cli-resources", "G5", "packages/cli", "test/cli-resources.test.ts"),
  test("cli-profile", "G2", "packages/cli", "test/cli-profile.test.ts", "test/cli-profile-service.test.ts", "test/legacy-profile.test.ts"),
  { id: "loginom-host", g: "G3+G4+G5+G6", cwd: "packages/loginom-host", cmd: ["xvfb-run", "-a", "bun", "test"] },
  { id: "dashboard", g: "G1", cwd: "packages/dashboard", cmd: ["bun", "run", "test"] },
  { id: "selftest", g: "migration", cwd: ".", cmd: ["scripts/upstream-sync/selftest.sh"] },
]

// One fresh mutation per guarantee and per test file that the log lists as not re-measured on v2.
// `from` must occur exactly once. `ref` is the result recorded in guarantees.md (0.4 or an earlier v2 task) for comparison only.
type Mutation = { id: string; g: string; file: string; from: string; to: string; run: string; ref: string }
const mutations: Mutation[] = [
  {
    id: "G1-permits",
    g: "G1",
    file: "packages/loginom-agent/src/access.ts",
    from: "export function permits(profile: Profile, tool: string) {",
    to: "export function permits(profile: Profile, tool: string) {\n  return true",
    run: "loginom-agent",
    ref: "B2.2: access.test.ts 6/0 -> 2/4, loginom-access.test.ts 7/0 -> 2/5",
  },
  {
    id: "G1-permits-server",
    g: "G1",
    file: "packages/loginom-agent/src/access.ts",
    from: "export function permits(profile: Profile, tool: string) {",
    to: "export function permits(profile: Profile, tool: string) {\n  return true",
    run: "server-access",
    ref: "B2.2: loginom-access.test.ts -> 2/5",
  },
  {
    id: "G2-flag-identity",
    g: "G2",
    file: "packages/util/src/global.ts",
    from: "process.env.LOGINOM_AI_AGENT_CONFIG_DIR ?? Path.config }",
    to: "process.env.OPENCODE_CONFIG_DIR ?? process.env.LOGINOM_AI_AGENT_CONFIG_DIR ?? Path.config }",
    run: "cli-identity",
    ref: "0.4: flag-identity.test.ts 2/0 -> 1 failure",
  },
  {
    id: "G2-port-block",
    g: "G2",
    file: "packages/product/src/cli-profile.ts",
    from: "0x400 * { prod: 0, beta: 1, dev: 2 }[channel]",
    to: "0",
    run: "product",
    ref: "B2.7c: one port block for all channels, cli-profile 4/0 -> 3/1",
  },
  {
    id: "G3-exit-code",
    g: "G3",
    file: "packages/loginom-host/src/supervisor.ts",
    from: "          outcome.code !== 0 ||\n",
    to: "          false ||\n",
    run: "loginom-host",
    ref: "0.4: process.test.ts 3/0 -> 1 failure",
  },
  {
    id: "G3-lease-drop",
    g: "G3",
    file: "packages/loginom-agent/src/index.ts",
    from: "        else await drop(event.data.sessionID)",
    to: "        else if (Date.now() < 0) await drop(event.data.sessionID)",
    run: "server-host-lease",
    ref: "B2.3: lease not released -> 6/1 each",
  },
  {
    id: "G4-recovery-journal",
    g: "G4",
    file: "packages/loginom-host/src/connection/recovery-store.ts",
    from: "  if (!strict) {",
    to: "  if (false) {",
    run: "loginom-host",
    ref: "0.4: host-port + recovery 20/0 -> 1 failure",
  },
  {
    id: "G5-manifest-required",
    g: "G5",
    file: "packages/loginom-host/src/cli-manifest.ts",
    from: 'if (!entries.has(required)) throw new Error("LOGINOM_MANIFEST_INCOMPLETE")',
    to: "if (false) throw new Error(required)",
    run: "loginom-host",
    ref: "B2.7a2: cli-manifest.test.ts 5/1 -> 4/2",
  },
  {
    id: "G5-manifest-resources",
    g: "G5",
    file: "packages/loginom-host/src/cli-manifest.ts",
    from: 'if (!entries.has(required)) throw new Error("LOGINOM_MANIFEST_INCOMPLETE")',
    to: "if (false) throw new Error(required)",
    run: "cli-resources",
    ref: "B2.7a2: cli-resources.test.ts 10/0 -> 9/1 (other mutation of the same file)",
  },
  {
    id: "G5-stage-resources",
    g: "G5",
    file: "packages/loginom-host/script/stage-resources.ts",
    from: '      : platform === "win32"\n        ? "win32-x64"',
    to: '      : platform === "win32"\n        ? "linux-x64"',
    run: "loginom-host",
    ref: "not measured on v2",
  },
  {
    id: "G5-ci-inputs",
    g: "G5",
    file: ".github/actions/setup-loginom-inputs/action.yml",
    from: "    - name: Install locked runtime dependencies\n",
    to: "    - name: Install locked runtime dependencies\n      if: always()\n",
    run: "loginom-host",
    ref: "not measured on v2",
  },
  {
    id: "G6-admits",
    g: "G6",
    file: "packages/loginom-agent/src/skills.ts",
    from: "  if (bundled.some((item) => item.id === skill.id && item.path === skill.path)) return true\n",
    to: "  return true\n",
    run: "loginom-agent",
    ref: "B2.4: skills.test.ts 5/0 -> 1/4",
  },
  {
    id: "G6-admits-server",
    g: "G6",
    file: "packages/loginom-agent/src/skills.ts",
    from: "  if (bundled.some((item) => item.id === skill.id && item.path === skill.path)) return true\n",
    to: "  return true\n",
    run: "server-access",
    ref: "B2.4: loginom-access.test.ts 9/0 -> 7/2",
  },
  {
    id: "MIG-repo-paths",
    g: "repo-paths",
    file: "turbo.json",
    from: '"@opencode/cli#typecheck:tsc"',
    to: '"@opencode/clx#typecheck:tsc"',
    run: "product",
    ref: "repo-paths red on a dangling turbo task key",
  },
  {
    id: "MIG-names",
    g: "names",
    file: "packages/product/package.json",
    from: '"name": "@loginom-ai-agent/product"',
    to: '"name": "@opencode/product"',
    run: "product",
    ref: "names red on a foreign package name",
  },
]

type Counts = { pass: number; fail: number; errors: number; files: number; code: number; seconds: number }

const baselines = new Map<string, Counts>()

async function execute(item: Command, label: string): Promise<Counts> {
  const started = Date.now()
  const child = Bun.spawn(item.cmd, { cwd: join(repo, item.cwd), env, stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  const text = stdout + stderr
  writeFileSync(join(out, `${label}.log`), text)
  // bun prints one summary per invocation: " 38 pass", " 2 fail", " 1 error", "Ran 40 tests across 6 files."
  const sum = (word: string) =>
    [...text.matchAll(new RegExp(`^\\s*(\\d+) ${word}\\b`, "gm"))].reduce((total, match) => total + Number(match[1]), 0)
  const files = [...text.matchAll(/across (\d+) files?/g)].reduce((total, match) => total + Number(match[1]), 0)
  return { pass: sum("pass"), fail: sum("fail"), errors: sum("errors?"), files, code, seconds: Math.round((Date.now() - started) / 1000) }
}

const show = (value: Counts) => `${value.pass}/${value.fail}${value.errors ? `+${value.errors}err` : ""}`
const results = { sha, runs: {} as Record<string, Counts>, mutations: [] as unknown[] }
const save = () => writeFileSync(join(out, "results.json"), JSON.stringify(results, null, 2) + "\n")
const table: string[] = []

async function baseline(id: string) {
  const known = baselines.get(id)
  if (known) return known
  const item = commands.find((command) => command.id === id)!
  const value = await execute(item, `base-${id}`)
  baselines.set(id, value)
  return value
}

if (mode !== "mutate") {
  table.push("| command | guarantee | pass/fail | exit | seconds |", "|---|---|---|---|---|")
  for (const item of commands.filter((command) => !only || only.has(command.id))) {
    const value = await baseline(item.id)
    results.runs[item.id] = value
    table.push(`| ${item.id} | ${item.g} | ${show(value)} | ${value.code} | ${value.seconds} |`)
    save()
  }
}

const restore = () => {
  Bun.spawnSync(["git", "checkout", "--", "."], { cwd: repo })
}
process.on("SIGINT", () => (restore(), process.exit(130)))
process.on("SIGTERM", () => (restore(), process.exit(143)))

if (mode !== "run") {
  table.push("", "| mutation | guarantee | test set | base | mutated | after revert | verdict | reference |", "|---|---|---|---|---|---|---|---|")
  for (const mutation of mutations.filter((item) => !only || only.has(item.id))) {
    const command = commands.find((item) => item.id === mutation.run)!
    const before = await baseline(mutation.run)
    const path = join(repo, mutation.file)
    const text = readFileSync(path, "utf8")
    const found = text.split(mutation.from).length - 1
    if (found !== 1) {
      table.push(`| ${mutation.id} | ${mutation.g} | ${mutation.run} | ${show(before)} | - | - | NOT APPLIED (${found} matches) | ${mutation.ref} |`)
      results.mutations.push({ id: mutation.id, verdict: "not-applied", matches: found })
      continue
    }
    writeFileSync(path, text.replace(mutation.from, () => mutation.to))
    const changed = git("diff", "--stat")
    const mutated = await execute(command, `mut-${mutation.id}`)
    restore()
    const clean = git("status", "--porcelain") === ""
    const after = await execute(command, `rev-${mutation.id}`)
    const red = mutated.fail > before.fail || mutated.errors > before.errors || (mutated.code !== 0 && before.code === 0)
    const green = clean && after.pass === before.pass && after.fail === before.fail && after.errors === before.errors
    const verdict = red && green ? "red -> green" : !red ? "NOT RED (finding)" : "NOT RESTORED"
    table.push(`| ${mutation.id} | ${mutation.g} | ${mutation.run} | ${show(before)} | ${show(mutated)} | ${show(after)} | ${verdict} | ${mutation.ref} |`)
    results.mutations.push({ id: mutation.id, verdict, base: before, mutated, after, diff: changed })
    save()
  }
}

save()
writeFileSync(join(out, "table.md"), table.join("\n") + "\n")
console.log(`SHA ${sha}\n${table.join("\n")}\nlogs: ${out}`)
