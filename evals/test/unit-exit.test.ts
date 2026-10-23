import { expect, test } from "bun:test"
import { mkdtemp, readFile, rename, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { observeUnitExit } from "../src/process-supervisor"
import { reconcileStartupCleanup } from "../src/startup-reconciliation"
import { reopenEnvironmentLeases } from "../src/slots"
import { parallelFixture } from "./helpers/parallel-fixture"

for (const delegate of ["no", "yes"] as const) test.skipIf(process.env.EVAL_SYSTEMD_TESTS !== "1")(`systemd binding qualifies only a nondelegated unit: Delegate=${delegate}`, async () => {
  const unit = `loginom-evals-binding-${crypto.randomUUID()}.service`
  const child = Bun.spawn(["systemd-run", "--user", "--quiet", "--wait", "--pipe", "--collect", `--unit=${unit}`, `--property=Delegate=${delegate}`,
    process.execPath, "-e", `const {captureUnitBinding}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/process-supervisor.ts"))});
      console.log(JSON.stringify({pid:process.pid,binding:await captureUnitBinding()}))`], { stdout: "pipe", stderr: "pipe" })
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  if (code !== 0) throw Error(`Binding fixture failed: ${stderr}`)
  const observed = JSON.parse(stdout)
  if (delegate === "yes") { expect(observed.binding).toBeUndefined(); return }
  expect(observed.binding).toMatchObject({ unit, manager: "user", bootId: (await readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim(),
    producer: { pid: observed.pid, uid: process.getuid!() } })
  expect(observed.binding.invocation).toMatch(/^[a-f0-9]{32}$/)
  expect(observed.binding.cgroup.endsWith(`/${unit}`)).toBe(true)
  expect(observed.binding.producer.starttime).toMatch(/^\d+$/)
})

test.skipIf(process.env.EVAL_SYSTEMD_TESTS !== "1")("unit exit recovery never signals a live producer and preserves the original failed receipt across reentry", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-unit-exit-")), fixture = await parallelFixture(root)
  const profile = fixture.slots.slots[0]!.profileDir
  const unit = `loginom-evals-exit-${crypto.randomUUID()}.service`, sourceFile = path.join(root, "cleanup.json")
  const ready = path.join(root, "ready.json"), release = path.join(root, "release"), heartbeat = path.join(root, "heartbeat")
  const identity = { containerId: "a".repeat(64), startedAt: "original", serverEpoch: "b".repeat(64), studioContainerId: "c".repeat(64),
    studioStartedAt: "original", configurationHash: "d".repeat(64) }
  const journal = path.join(fixture.slots.controller.stateDir, "command.json")
  let reopened: Awaited<ReturnType<typeof reopenEnvironmentLeases>>
  const script = `
    const {captureUnitBinding,superviseProcess}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/process-supervisor.ts"))});
    const {writeLeaseReceipt}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/lease.ts"))});
    const {writeFile}=await import("node:fs/promises");
    const {acquireEnvironmentLeases}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/slots.ts"))});
    const binding=await captureUnitBinding();
    await writeLeaseReceipt(${JSON.stringify(journal)},{version:2,kind:"unactivated-preparation",commandId:"unit-exit",identity:${JSON.stringify(identity)},slotIds:["a"],phase:"cli_admitted",unitBinding:binding});
    const leases=await acquireEnvironmentLeases(${JSON.stringify(fixture.slots)},1,${JSON.stringify(identity)},${JSON.stringify(journal)},${JSON.stringify(fixture.lockRoot)});
    const run=await superviseProcess({cmd:[process.execPath,"-e","await Bun.sleep(40)"],cwd:${JSON.stringify(root)},
      env:{PATH:process.env.PATH},timeoutMs:2000});
    if(run.processCleanup.status!=="confirmed")throw Error("Fixture supervisor failed");
    const original={...run.processCleanup,status:"failed",error:"Cannot inspect process identity PID "+run.processCleanup.launcher.pid+": Process UID changed (proc_uid=0, starttime=unknown, state=unknown)"};
    await writeLeaseReceipt(${JSON.stringify(sourceFile)},{processes:original});
    await writeFile(${JSON.stringify(`${profile}.process-group`)},String(original.launcher.pid),{mode:0o600,flag:"wx"});
    await writeLeaseReceipt(${JSON.stringify(ready)},{binding,owner:leases.server.reservation.owner});
    let tick=0;while(!await Bun.file(${JSON.stringify(release)}).exists()){await Bun.write(${JSON.stringify(heartbeat)},String(++tick));await Bun.sleep(20)}
    await Promise.all([leases.server.close(),...leases.slots.map(slot=>slot.close())]);
    process.exit(1);
  `
  try {
    const launch = Bun.spawn(["systemd-run", "--user", "--quiet", `--unit=${unit}`, "--property=Delegate=no", process.execPath, "-e", script],
      { stdout: "ignore", stderr: "pipe" })
    expect(await launch.exited).toBe(0)
    const deadline = Date.now() + 8000
    while (!await Bun.file(ready).exists()) { if (Date.now() > deadline) throw Error("Unit fixture did not become ready"); await Bun.sleep(20) }
    const saved = await Bun.file(ready).json()
    const input = { sourceFile, profile, binding: saved.binding, owner: saved.owner }
    const original = await Bun.file(sourceFile).text()
    await expect(observeUnitExit(input)).rejects.toThrow()
    const before = Number(await Bun.file(heartbeat).text())
    await Bun.sleep(80)
    expect(Number(await Bun.file(heartbeat).text())).toBeGreaterThan(before)
    await Bun.write(release, "finish")
    while ((await Bun.$`systemctl --user show ${unit} --property=ActiveState --value`.quiet()).text().trim() !== "failed") {
      if (Date.now() > deadline) throw Error("Unit fixture did not exit"); await Bun.sleep(20)
    }
    const proof = await observeUnitExit(input)
    expect(proof.processes).toMatchObject({ status: "confirmed", observation_mode: "systemd_post_exit", capture_complete: true })
    expect(proof.processes.verification).toHaveLength(2)
    expect(await Bun.file(sourceFile).text()).toBe(original)
    await expect(observeUnitExit({ ...input, binding: { ...input.binding, invocation: "0".repeat(32) } })).rejects.toThrow()
    expect(await Bun.file(`${profile}.process-group`).exists()).toBe(true)
    reopened = await reopenEnvironmentLeases(fixture.slots, identity, fixture.lockRoot)
    const recovery = { unitBinding: saved.binding, owner: reopened!.server.reservation.owner, server: reopened!.server, lease: reopened!.slots[0]! }
    expect((await reconcileStartupCleanup(sourceFile, saved.owner.pid, recovery)).status).toBe("confirmed")
    expect(await Bun.file(`${profile}.process-group`).exists()).toBe(false)
    expect((await reconcileStartupCleanup(sourceFile, saved.owner.pid, recovery)).status).toBe("confirmed")
    expect(await Bun.file(sourceFile).text()).toBe(original)
    await rename(profile, `${profile}.moved`)
    await expect(observeUnitExit(input)).rejects.toThrow()
    await rename(`${profile}.moved`, profile)
  } finally {
    await Promise.all([reopened?.server.close(), ...reopened?.slots.map(slot => slot.close()) ?? []])
    await Bun.write(release, "finish")
    await Bun.$`systemctl --user stop ${unit}`.quiet().nothrow()
    await Bun.$`systemctl --user reset-failed ${unit}`.quiet().nothrow()
    await rm(root, { recursive: true, force: true })
  }
})
