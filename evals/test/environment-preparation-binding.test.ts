import { expect, test } from "bun:test"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { readLeaseReceipt, readResourceReservation, reopenResourceLease, writeLeaseReceipt } from "../src/lease"
import { createPair, destroyPair, pairImages } from "../src/parallel-pair"
import { parseSlots } from "../src/slots"
import { parallelFixture } from "./helpers/parallel-fixture"

for (const [operation, delegate] of [["prepare", "no"], ["verify", "yes"]] as const)
  test.skipIf(process.env.EVAL_SYSTEMD_TESTS !== "1" || process.env.EVAL_PAIR_INTEGRATION !== "1")(
  `${operation} journal preserves its current systemd binding before admin admission: Delegate=${delegate}`, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "evals-preparation-binding-")), fixture = await parallelFixture(root)
    const name = `evals-binding-${crypto.randomUUID().slice(0, 8)}`, unit = `${name}.service`
    const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } })
    const url = `http://127.0.0.1:${listener.port}/app/`
    listener.stop(true)
    const file = parseSlots({ ...fixture.slots, server: { ...fixture.slots.server, container: `${name}-server`, studioContainer: `${name}-studio`,
      network: name, alias: "loginom-server-7.4.2-test", url } }, 1)
    const slotsFile = path.join(root, "slots.json"), resultFile = path.join(root, "result.json")
    await writeLeaseReceipt(slotsFile, file)
    await writeLeaseReceipt(file.controller.adminCredentialsFile, {})
    const options = { purpose: "research" as const, out: path.join(root, "evidence"), lockRoot: fixture.lockRoot }
    if (process.env.EVAL_TEST_DOCKER_SUBNET) {
      const nonce = crypto.randomUUID()
      const network = (await Bun.$`docker network create --subnet ${process.env.EVAL_TEST_DOCKER_SUBNET} --label loginom.evals.kind=users --label loginom.evals.purpose=research --label ${`loginom.evals.nonce=${nonce}`} ${name}`.quiet()).text().trim()
      await writeLeaseReceipt(path.join(file.controller.stateDir, "pair.json"), { version: 2, kind: "pair-provision", nonce,
        purpose: options.purpose, daemonId: (await Bun.$`docker info --format ${"{{.ID}}"}`.quiet()).text().trim(), server: file.server,
        images: pairImages, resources: { network }, phase: "provisioning" })
    }
    const pair = await createPair(file, options)
    const script = `
      const {${operation}Environment,EnvironmentFailure}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/environment-preparation.ts"))});
      const {captureUnitBinding}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/process-supervisor.ts"))});
      const {loadConfig}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/config.ts"))});
      const config=loadConfig(["--skip-judge"],{EVAL_SLOTS_FILE:${JSON.stringify(slotsFile)},EVAL_CLI_MODE:"binary",EVAL_CLI_BIN:"/bin/false",LOGINOM_DOCK_API_KEY:"fixture-dock",EVAL_AGENT_MODEL:"fake/fake-model"});
      const binding=await captureUnitBinding();
      try { await ${operation}Environment({slotsFile:${JSON.stringify(slotsFile)},parallel:1,config},${JSON.stringify(fixture.lockRoot)}); throw Error("unexpected preparation"); }
      catch(error) {
        if(!(error instanceof EnvironmentFailure)||error.message!=="ADMIN_RUNTIME_INVALID")throw error;
        await Bun.write(${JSON.stringify(resultFile)},JSON.stringify({pid:process.pid,binding,receipt:error.receipt}));
      }
    `
    try {
      const child = Bun.spawn(["systemd-run", "--user", "--quiet", "--wait", "--pipe", `--unit=${unit}`, `--property=Delegate=${delegate}`,
        process.execPath, "-e", script], { stdout: "pipe", stderr: "pipe" })
      const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
      if (code !== 0) throw Error(`Preparation fixture failed: ${stderr}`)
      const result = await Bun.file(resultFile).json()
      const receipt = await readLeaseReceipt(result.receipt) as { journal: string; ready: boolean; reason: string }
      const journal = await readLeaseReceipt(receipt.journal) as { unitBinding?: object; phase: string }
      expect(receipt).toMatchObject({ ready: false, reason: "ADMIN_RUNTIME_INVALID" })
      if (delegate === "no") expect(result.binding).toMatchObject({ unit, manager: "user", producer: { pid: result.pid, uid: process.getuid!() } })
      if (delegate === "yes") expect(result.binding).toBeUndefined()
      expect(journal.unitBinding).toEqual(result.binding)
      expect(Object.hasOwn(journal, "unitBinding")).toBe(delegate === "no")
      expect(journal.phase).toBe("unactivated")
      expect((await readdir(file.controller.stateDir)).some(name => name.startsWith("admin-"))).toBe(false)
    } finally {
      await Bun.$`systemctl --user stop ${unit}`.quiet().nothrow()
      // Runtime validation failed before admitting any admin, user, or model actor.
      // Release unused resource reservations without inventing process-cleanup proof.
      if (await Bun.file(resultFile).exists()) {
        for (const key of [`profile:${file.slots[0]!.profileDir}`, `server:${pair.identity.containerId}`]) {
          const reservation = await readResourceReservation({ key, lockRoot: fixture.lockRoot })
          if (!reservation || reservation.state === "released") continue
          const lease = await reopenResourceLease({ key, lockRoot: fixture.lockRoot }, reservation)
          try {
            const proof = path.join(root, `unused-${lease.reservation.token}.json`)
            await writeLeaseReceipt(proof, { version: 2, status: "confirmed", reason: "not-used", key,
              token: lease.reservation.token, revision: lease.reservation.revision, serverEpoch: pair.identity.serverEpoch })
            await lease.release(proof)
          } finally { await lease.close() }
        }
        await destroyPair(file, options)
        await rm(root, { recursive: true, force: true })
      } else console.error(`Preparation fixture retained: ${root}`)
      await Bun.$`systemctl --user reset-failed ${unit}`.quiet().nothrow()
    }
  }, 90_000,
)
