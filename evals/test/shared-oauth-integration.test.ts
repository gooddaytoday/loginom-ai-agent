import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { chmod, cp, link, mkdir, mkdtemp, rm, stat, symlink, writeFile } from "node:fs/promises"
import { spawn } from "node:child_process"
import { agentCommand } from "../src/cli"
import { loadConfig } from "../src/config"
import { sandboxCommand } from "../src/sandbox"

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
