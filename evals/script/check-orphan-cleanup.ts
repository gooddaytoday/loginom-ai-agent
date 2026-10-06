import path from "node:path"
import { mkdir } from "node:fs/promises"
import { cleanupOrphanResult, listStorage } from "../src/artifact"

const container = process.env.LOGINOM_CONTAINER ?? "loginom-server-master"
const storageDir = `/tmp/lab16-cleanup-${crypto.randomUUID()}`
const source = { kind: "docker" as const, container, storageDir }
const output = path.resolve(process.argv[2] ?? "results/orphan-storage-check")
const names: string[] = []
const checks: { check: string; passed: boolean; error?: string }[] = []
await mkdir(output, { recursive: true })

async function write(name: string, bytes: string) {
  names.push(name)
  const child = Bun.spawn(["docker", "exec", "-i", container, "sh", "-c", 'cat > "$1"', "fixture-write", `${storageDir}/${name}`],
    { stdin: new Blob([bytes]), stdout: "pipe", stderr: "pipe" })
  const [exit, error] = await Promise.all([child.exited, new Response(child.stderr).text()])
  if (exit !== 0) throw Error(error)
}
async function exists(name: string) {
  const result = await Bun.$`docker exec ${container} sh -c ${'test -e "$1" || test -L "$1"'} fixture-exists ${`${storageDir}/${name}`}`.quiet().nothrow()
  return result.exitCode === 0
}
async function reject(check: string, name: string, existingNames: string[], processesConfirmed = true, pattern = /ownership|regular file|Process cleanup/) {
  const outDir = path.join(output, check)
  const error = await cleanupOrphanResult({ source, name, existingNames, processesConfirmed, outDir }).then(() => null, e => String(e))
  const receipt = await Bun.file(path.join(outDir, "storage-cleanup.json")).json()
  const passed = error !== null && pattern.test(error) && await exists(name) && receipt.status === "failed" && !receipt.removed
  checks.push({ check, passed, ...(error ? { error } : {}) })
  if (!passed) throw Error(`${check}: expected refusal with unchanged storage`)
}

try {
  await Bun.$`docker exec ${container} mkdir -m 700 -- ${storageDir}`.quiet()
  await write("personal.csv", "foreign fixture bytes\n")
  const before = (await listStorage(source)).map(e => e.name)
  const name = "eval-runtime-own-1.result.csv", bytes = "Region,A,B\nN,7.5,7\nS,3,2\n"
  await write(name, bytes)
  await cleanupOrphanResult({ source, name, existingNames: before, processesConfirmed: true, outDir: path.join(output, "owned") })
  const receipt = await Bun.file(path.join(output, "owned/storage-cleanup.json")).json()
  const copied = await Bun.file(path.join(output, "owned/storage-outputs", name)).text()
  const passed = copied === bytes && receipt.status === "confirmed" && receipt.verified_absent && !await exists(name) && await exists("personal.csv")
  checks.push({ check: "owned", passed }); if (!passed) throw Error("owned result not preserved/removed")
  const old = "eval-runtime-old-1.result.csv"
  await write(old, "old fixture bytes\n"); await reject("pre-existing", old, [old])
  const pending = "eval-runtime-pending-1.result.csv"
  await write(pending, "owned fixture bytes\n"); await reject("process-unconfirmed", pending, [], false)
  const sym = "eval-runtime-symlink-1.result.csv"
  names.push(sym)
  await Bun.$`docker exec ${container} ln -s -- personal.csv ${`${storageDir}/${sym}`}`.quiet()
  await reject("symlink", sym, [])
  const hard = "eval-runtime-hardlink-1.result.csv"
  names.push(hard)
  await Bun.$`docker exec ${container} ln -- ${`${storageDir}/personal.csv`} ${`${storageDir}/${hard}`}`.quiet()
  await reject("hardlink", hard, [])
  const blocked = "eval-runtime-copy-failure-1.result.csv"
  await write(blocked, "owned fixture bytes\n")
  await Bun.write(path.join(output, "copy-failure/storage-outputs"), "blocked evidence directory")
  await reject("copy-failure", blocked, [], true, /EEXIST|ENOTDIR/)
  console.log(JSON.stringify({ checks, model_attempts: 0, fixtures_outside_user_storage: true }))
} finally {
  const removed = await Bun.$`docker exec ${container} rm -f -- ${names.map(name => `${storageDir}/${name}`)}`.quiet().nothrow()
  const directory = await Bun.$`docker exec ${container} rmdir -- ${storageDir}`.quiet().nothrow()
  await Bun.write(path.join(output, "verification.json"), JSON.stringify({ checks, fixture_cleanup_confirmed: removed.exitCode === 0 && directory.exitCode === 0,
    model_attempts: 0, source_container: container, isolated_fixture_directory: storageDir }, null, 2) + "\n")
  if (removed.exitCode !== 0 || directory.exitCode !== 0) throw Error("Owned fixture cleanup unconfirmed")
}
