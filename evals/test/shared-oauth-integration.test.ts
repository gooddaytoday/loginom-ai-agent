import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { chmod, cp, link, mkdir, mkdtemp, rm, stat, symlink, writeFile } from "node:fs/promises"
import { spawn } from "node:child_process"
import { agentCommand } from "../src/cli"
import { loadConfig } from "../src/config"
import { sandboxCommand } from "../src/sandbox"
import { assertAuth } from "../src/profile"
import { readLeaseReceipt } from "../src/lease"
import { superviseProcess } from "../src/process-supervisor"

test.skipIf(!process.env.EVAL_SHARED_CANDIDATE_RECEIPT)("installed candidate: public shared status and bwrap accept only consistent schema fixtures", async () => {
  const receipt = await readLeaseReceipt(process.env.EVAL_SHARED_CANDIDATE_RECEIPT!) as {
    binary: string; binarySha256: string; installedRoot: string; manifestSha256: string; metadata: { capabilities: string[] }
  }
  expect(receipt.metadata.capabilities).toContain("shared-oauth-v1")
  expect(new Bun.CryptoHasher("sha256").update(await Bun.file(receipt.binary).bytes()).digest("hex")).toBe(receipt.binarySha256)
  expect(new Bun.CryptoHasher("sha256").update(await Bun.file(path.join(receipt.installedRoot, "cli-manifest.json")).bytes()).digest("hex")).toBe(receipt.manifestSha256)
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-installed-shared-status-"))
  try {
    const shared = path.join(root, "shared")
    const profile = path.join(root, "profile")
    const work = path.join(root, "workspace")
    await Promise.all([shared, profile, work, path.join(root, "profile-b"), path.join(root, "workspace-b")].map(dir => mkdir(dir, { mode: 0o700 })))
    const config = { ...loadConfig(["--skip-judge"], { EVAL_CLI_MODE: "binary", EVAL_CLI_BIN: receipt.binary,
      EVAL_SLOTS_FILE: "explicit-nonmodel-protocol-probe", EVAL_AGENT_MODEL: "openai/gpt-6-luna", LOGINOM_DOCK_API_KEY: "fixture", EVAL_PROFILE_DIR: profile }),
      auth: { sharedDir: shared } }
    const command = { ...agentCommand(config), cleanupDir: path.join(root, "controller") }
    await expect(assertAuth(config, command)).rejects.toThrow("SHARED_AUTH_OAUTH_REQUIRED")
    const local = JSON.stringify({ openai: { type: "oauth", refresh: "local-fixture", access: "local-fixture", expires: 0 } })
    await writeFile(path.join(profile, "data/auth.json"), local, { mode: 0o600 })
    await expect(assertAuth(config, command)).rejects.toThrow("SHARED_AUTH_OAUTH_REQUIRED")
    const generation = crypto.randomUUID()
    const claims = { sub: "fixture-user", "https://api.openai.com/auth": { chatgpt_user_id: "fixture-user", chatgpt_account_id: "fixture-account" } }
    const bytes = JSON.stringify({ openai: { type: "oauth", access: `fixture.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`,
      refresh: "fixture-refresh", expires: 0, accountId: "fixture-account" },
      $sharedOAuth: { version: 1, sessions: { openai: { generation, userId: "fixture-user", accountId: "fixture-account" } } } })
    await writeFile(path.join(shared, "auth.json"), bytes, { mode: 0o600 })
    const admitted = await assertAuth(config, command)
    expect(admitted).toMatchObject({ generation, refresh_required: true })
    const lock = await stat(path.join(shared, "auth.json.lock"))
    const runs = await Promise.all([[profile, work], [path.join(root, "profile-b"), path.join(root, "workspace-b")]].map(async ([profileDir, workdir]) => {
      const own = agentCommand({ ...config, profileDir: profileDir! })
      const args = [...own.cmd, "providers", "status", "--provider", "openai", "--format", "json"]
      const boundary = await sandboxCommand({ cmd: args, profileDir: profileDir!, workdir: workdir!, env: own.env })
      return superviseProcess({ cmd: args, cwd: workdir!, env: boundary.env, sandbox: boundary.cmd, profileDir: profileDir!, timeoutMs: 20_000 })
    }))
    for (const run of runs) {
      expect({ code: run.exitCode, cleanup: run.processCleanup.status }).toEqual({ code: 0, cleanup: "confirmed" })
      expect(JSON.parse(run.stdout)).toEqual({ format: "shared-oauth-status-v1", provider: "openai", status: "ready", ...admitted })
    }
    expect(Math.min(...runs.map(run => run.startedAt + run.durationMs)) - Math.max(...runs.map(run => run.startedAt))).toBeGreaterThan(0)
    const after = await stat(path.join(shared, "auth.json.lock"))
    expect({ dev: after.dev, ino: after.ino }).toEqual({ dev: lock.dev, ino: lock.ino })
    const pending = JSON.stringify({ provider: "openai", transaction: "uncommitted", generation })
    await writeFile(path.join(shared, "refresh-pending.json"), pending, { mode: 0o600 })
    await expect(assertAuth(config, command)).rejects.toThrow("SHARED_AUTH_REFRESH_UNCERTAIN_RELOGIN_REQUIRED")
    expect(await Bun.file(path.join(shared, "refresh-pending.json")).text()).toBe(pending)
    expect(await Bun.file(path.join(shared, "auth.json")).text()).toBe(bytes)
    expect(await Bun.file(path.join(profile, "data/auth.json")).text()).toBe(local)
  } finally { await rm(root, { recursive: true, force: true }) }
}, 90_000)

test("shared directory bind: a hardlink to controller evidence is refused before child launch", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-shared-hardlink-"))
  try {
    await Promise.all(["installation/bin", "profile", "workspace", "shared", "controller"]
      .map(dir => mkdir(path.join(root, dir), { recursive: true, mode: 0o700 })))
    await cp("/usr/bin/python3", path.join(root, "installation/bin/cli"), { dereference: true })
    await Bun.write(path.join(root, "installation/cli-manifest.json"), "{}")
    await writeFile(path.join(root, "controller/secret-canary.txt"), "private-canary", { mode: 0o600 })
    await link(path.join(root, "controller/secret-canary.txt"), path.join(root, "shared/auth.json"))
    await expect(sandboxCommand({ cmd: [path.join(root, "installation/bin/cli")], profileDir: path.join(root, "profile"),
      workdir: path.join(root, "workspace"), env: { LOGINOM_AI_AGENT_SHARED_AUTH_DIR: path.join(root, "shared") } }))
      .rejects.toThrow("SHARED_AUTH_FILE_PRIVATE")
    expect(await Bun.file(path.join(root, "controller/secret-canary.txt")).text()).toBe("private-canary")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("shared directory bind: nonprivate files and symlinks never reach the child", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-shared-private-files-"))
  try {
    await Promise.all(["installation/bin", "profile", "workspace", "shared"]
      .map(dir => mkdir(path.join(root, dir), { recursive: true, mode: 0o700 })))
    await cp("/usr/bin/python3", path.join(root, "installation/bin/cli"), { dereference: true })
    await Bun.write(path.join(root, "installation/cli-manifest.json"), "{}")
    const file = path.join(root, "shared/auth.json")
    const input = { cmd: [path.join(root, "installation/bin/cli")], profileDir: path.join(root, "profile"),
      workdir: path.join(root, "workspace"), env: { LOGINOM_AI_AGENT_SHARED_AUTH_DIR: path.join(root, "shared") } }
    await writeFile(file, "opaque fixture", { mode: 0o644 })
    await chmod(file, 0o644)
    await expect(sandboxCommand(input)).rejects.toThrow("SHARED_AUTH_FILE_PRIVATE")
    await rm(file)
    await writeFile(path.join(root, "outside-canary.txt"), "private-canary", { mode: 0o600 })
    await symlink(path.join(root, "outside-canary.txt"), file)
    await expect(sandboxCommand(input)).rejects.toThrow("SHARED_AUTH_FILE_PRIVATE")
    await rm(file)
    await chmod(path.join(root, "shared"), 0o755)
    await expect(sandboxCommand(input)).rejects.toThrow("SHARED_AUTH_PATH_PRIVATE")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("shared directory bind: two sandboxes observe atomic replacement and the same permanent lock", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-shared-bind-"))
  try {
    const shared = path.join(root, "shared")
    const binary = path.join(root, "installation/bin/cli")
    await Promise.all([path.dirname(binary), shared, path.join(root, "controller"), path.join(root, "history"),
      ...["a", "b"].flatMap(id => [path.join(root, `profile-${id}`), path.join(root, `work-${id}`)])]
      .map(dir => mkdir(dir, { recursive: true, mode: 0o700 })))
    await cp("/usr/bin/python3", binary, { dereference: true })
    await Bun.write(path.join(root, "installation/cli-manifest.json"), "{}")
    await writeFile(path.join(shared, "auth.json"), '{"generation":"before"}', { mode: 0o600 })
    await writeFile(path.join(shared, "auth.json.lock"), "permanent", { mode: 0o600 })
    await writeFile(path.join(root, "controller/secret-canary.txt"), "private-canary", { mode: 0o600 })
    const directory = await stat(shared)
    const lock = await stat(path.join(shared, "auth.json.lock"))
    const script = `import json,os,pathlib,sys
p=pathlib.Path(sys.argv[1])
if not p.is_dir():
 print(json.dumps({'mounted':False})); sys.exit(0)
if sys.argv[2]=='a':
 fd=os.open(str(p/'auth.next'),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 os.write(fd,b'{"generation":"after"}'); os.fsync(fd); os.close(fd)
 os.replace(p/'auth.next',p/'auth.json')
d=p.stat(); lock=(p/'auth.json.lock').stat()
print(json.dumps({'mounted':True,'env':os.getenv('LOGINOM_AI_AGENT_SHARED_AUTH_DIR'),'directory':[d.st_dev,d.st_ino],'lock':[lock.st_dev,lock.st_ino],'generation':json.loads((p/'auth.json').read_text())['generation'],'hidden':[os.path.exists(x) for x in sys.argv[3:]]}))`
    for (const id of ["a", "b"]) {
      const config = loadConfig(["--dry-run"], { EVAL_SLOTS_FILE: "fixture-programmatic-only" })
      const command = agentCommand({ ...config, auth: { sharedDir: shared }, profileDir: path.join(root, `profile-${id}`),
        agent: { ...config.agent, cliMode: "binary", cliBin: binary } }, {})
      const hidden = [path.join(root, "controller/secret-canary.txt"), path.join(root, "controller"), path.join(root, "history"),
        path.join(root, `profile-${id === "a" ? "b" : "a"}`)]
      const boundary = await sandboxCommand({ cmd: [...command.cmd, "-c", script, shared, id, ...hidden],
        profileDir: path.join(root, `profile-${id}`), workdir: path.join(root, `work-${id}`), env: command.env })
      const child = spawn(boundary.cmd[0]!, boundary.cmd.slice(1), { cwd: boundary.cwd, env: boundary.env, stdio: ["ignore", "pipe", "pipe", "ignore"] })
      const output = await Promise.all([Array.fromAsync(child.stdout!), Array.fromAsync(child.stderr!), new Promise<number | null>(resolve => child.once("close", resolve))])
      expect(output[2]).toBe(0)
      expect(Buffer.concat(output[1]).toString()).toBe("")
      expect(JSON.parse(Buffer.concat(output[0]).toString())).toEqual({ mounted: true, env: shared,
        directory: [directory.dev, directory.ino], lock: [lock.dev, lock.ino], generation: "after", hidden: hidden.map(() => false) })
    }
    expect(await Bun.file(path.join(shared, "auth.json")).json()).toEqual({ generation: "after" })
    expect(await Bun.file(path.join(shared, "auth.json.lock")).text()).toBe("permanent")
  } finally { await rm(root, { recursive: true, force: true }) }
})
