import { expect, test } from "bun:test"
import path from "node:path"
import { tmpdir } from "node:os"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { globalLockRoot, writeLeaseReceipt } from "../src/lease"
import { createPair, destroyPair, readServerIdentity } from "../src/parallel-pair"
import { loadSlots, parseSlots } from "../src/slots"
import { parallelFixture } from "./helpers/parallel-fixture"
import { serverFileObservation } from "./helpers/server-file-observation"

test.skipIf(!process.env.EVAL_ADMIN_LIVE_CONFIG)("kernel observer preserves trailing newline paths and sees a live mmap control", async () => {
  const source = await loadSlots(process.env.EVAL_ADMIN_LIVE_CONFIG!, 1)
  const root = await mkdtemp(path.join(tmpdir(), "evals-file-observer-")), fixture = await parallelFixture(root)
  const name = `evals-files-${crypto.randomUUID().slice(0, 8)}`
  const port = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } }), url = `http://127.0.0.1:${port.port}/app/`
  port.stop(true)
  const file = parseSlots({ ...fixture.slots, server: { ...fixture.slots.server, container: `${name}-server`, studioContainer: `${name}-studio`, network: name, alias: "loginom-server-7.4.2-test", url },
    controller: { ...fixture.slots.controller, adminCredentialsFile: source.controller.adminCredentialsFile } }, 1)
  const options = { purpose: "research" as const, out: path.join(root, "evidence"), lockRoot: globalLockRoot }
  const pair = await createPair(file, options)
  const evidence = path.join(path.dirname(source.controller.stateDir), "evidence", `native-file-observer-${crypto.randomUUID()}`)
  await mkdir(evidence, { mode: 0o700 })
  console.error(`native file observer evidence: ${evidence}`)
  const pins = await Promise.all([import.meta.path, path.resolve(import.meta.dir, "helpers/server-file-observation.ts"),
    path.resolve(import.meta.dir, "../fixtures/server-files.sh"), path.resolve(import.meta.dir, "../src/parallel-pair.ts")].map(async file =>
    ({ path: file, sha256: new Bun.CryptoHasher("sha256").update(await Bun.file(file).bytes()).digest("hex") })))
  await writeLeaseReceipt(path.join(evidence, "source-pins.json"), { sources: pins, root, identity: pair.identity, resources: pair.resources })
  const directory = `${file.server.storageRoot}/eval-a`, target = directory + "/observer\n", executable = directory + "/mapped-observer"
  const child = Bun.spawn(["docker", "--host", "unix:///var/run/docker.sock", "exec", "-i", pair.identity.containerId, "sh", "-c",
    'set -eu; mkdir -p "$1"; exec 7>"$2"; cp /bin/sleep "$3"; chmod 700 "$3"; "$3" 5 & sleeper=$!; printf "ready\\n"; read -r answer; wait "$sleeper"',
    "observer-control", directory, target, executable], { stdin: "pipe", stdout: "pipe", stderr: "pipe", timeout: 15_000 })
  try {
    const ready = await child.stdout.getReader().read()
    expect(new TextDecoder().decode(ready.value)).toContain("ready")
    const opened = await serverFileObservation(pair.identity.containerId)
    await writeLeaseReceipt(path.join(evidence, "opened.json"), { identity: pair.identity, directory, target, executable, opened, cleanupAllowed: false })
    expect(opened.complete).toBe(true)
    expect(opened.files.some(file => file.target === target)).toBe(true)
    expect(opened.processes.some(process => process.pid !== 1 && process.maps.includes(executable))).toBe(true)
  } finally {
    child.stdin.write("done\n")
    child.stdin.end()
    const code = await child.exited
    const closed = await serverFileObservation(pair.identity.containerId)
    await writeLeaseReceipt(path.join(evidence, "closed.json"), { identity: pair.identity, target, executable, code, closed, cleanupAllowed: false })
    expect(code).toBe(0)
    expect(closed.complete).toBe(true)
    expect(closed.files.some(file => file.target === target)).toBe(false)
    expect(closed.processes.some(process => process.maps.includes(executable))).toBe(false)
    expect(await readServerIdentity(file)).toEqual(pair.identity)
    await destroyPair(file, options)
    await rm(root, { recursive: true })
  }
}, 90_000)
