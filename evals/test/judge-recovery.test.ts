import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { evalsRoot, loadConfig } from "../src/config"
import { writeLeaseReceipt } from "../src/lease"
import { superviseProcess } from "../src/process-supervisor"
import { runOfflineJudge } from "../src/judge-environment"
import { recoverOfflineJudge } from "../src/judge-recovery"
import { parallelFixture } from "./helpers/parallel-fixture"

test("offline recovery releases a dead command only after qualifying its actual closed judge proofs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-judge-recovery-"))
  const fixture = await parallelFixture(root), slotsFile = path.join(root, "slots.json"), trace = path.join(root, "judge.jsonl")
  await writeLeaseReceipt(slotsFile, fixture.slots)
  await mkdir(path.join(root, "supervision"), { mode: 0o700 })
  const env = { EVAL_SLOTS_FILE: slotsFile, EVAL_RESULTS_DIR: path.join(root, "results"), JUDGE_MODEL: "fake",
    EVAL_JUDGE_COMMAND: `bun ${path.join(evalsRoot, "fixtures/fake-codex.ts")} --gate-log ${trace} --delay-ms 500` }
  const script = path.join(root, "failed-command.ts")
  await Bun.write(script, `import {runOfflineJudge} from ${JSON.stringify(path.join(evalsRoot, "src/judge-environment.ts"))}
import {loadConfig} from ${JSON.stringify(path.join(evalsRoot, "src/config.ts"))}
import {mkdir} from "node:fs/promises"
import path from "node:path"
const pending=runOfflineJudge(loadConfig(["--calibrate","--only","group-sum-qty"],${JSON.stringify(env)}),${JSON.stringify(fixture.lockRoot)})
const deadline=Date.now()+10000
while(!await Bun.file(${JSON.stringify(trace)}).exists()){if(Date.now()>deadline)throw Error("Judge did not start");await Bun.sleep(10)}
const files=await Array.fromAsync(new Bun.Glob("*.reservation.json").scan({cwd:${JSON.stringify(fixture.lockRoot)},absolute:true}))
const reservation=await Bun.file(files[0]).json()
await mkdir(path.join(path.dirname(reservation.journal),"cleanup.json"))
await pending.catch(()=>{})
`)
  let confirmed = false
  try {
    const child = await superviseProcess({ cmd: [process.execPath, script], cwd: root,
      env: { PATH: process.env.PATH ?? "", HOME: root }, timeoutMs: 15000, outDir: path.join(root, "supervision") })
    confirmed = child.processCleanup.status === "confirmed" && child.processCleanup.capture_complete
    expect({ confirmed, code: child.exitCode }).toEqual({ confirmed: true, code: 0 })
    const files = await Array.fromAsync(new Bun.Glob("*.reservation.json").scan({ cwd: fixture.lockRoot, absolute: true }))
    const retained = await Bun.file(files[0]!).json()
    expect(retained.state).toBe("retained")
    const journal = await Bun.file(retained.journal).json(), calibration = path.join(journal.runDir, "calibration.json")
    const bytes = await Bun.file(calibration).text(), calls = await Bun.file(trace).text()
    await expect(recoverOfflineJudge({ slotsFile, journal: retained.journal, token: "foreign", revision: retained.revision }, fixture.lockRoot))
      .rejects.toThrow("LEASE_CAS_STALE")
    const inventory = await Bun.file(journal.processInventory).json()
    await writeLeaseReceipt(journal.processInventory, { ...inventory,
      processes: inventory.processes.map((entry: { state: string }, index: number) => index ? entry : { ...entry, state: "planned" }) })
    const failedInput = path.join(root, "recovery-input.json")
    await writeLeaseReceipt(failedInput, { input: { slotsFile, journal: retained.journal, token: retained.token, revision: retained.revision }, lockRoot: fixture.lockRoot })
    const retry = Bun.spawn([process.execPath, "-e", `const {recoverOfflineJudge}=await import(${JSON.stringify(path.join(evalsRoot, "src/judge-recovery.ts"))});
const request=await Bun.file(${JSON.stringify(failedInput)}).json();
try{await recoverOfflineJudge(request.input,request.lockRoot);process.exitCode=1}catch(error){console.log(error.message)}`],
      { env: { PATH: process.env.PATH ?? "", HOME: root }, stdin: "ignore", stdout: "pipe", stderr: "pipe" })
    const [code, stdout, stderr] = await Promise.all([retry.exited, new Response(retry.stdout).text(), new Response(retry.stderr).text()])
    expect({ code, stdout: stdout.trim(), stderr }).toEqual({ code: 0, stdout: "JUDGE_PROCESS_PROOF_UNCONFIRMED", stderr: "" })
    const failed = await Bun.file(files[0]!).json()
    expect(failed).toMatchObject({ state: "recovery-only", revision: retained.revision + 1 })
    await expect(runOfflineJudge(loadConfig(["--calibrate", "--only", "group-sum-qty"], env), fixture.lockRoot)).rejects.toThrow("RECOVERY_REQUIRED")
    await writeLeaseReceipt(journal.processInventory, inventory)
    expect(await recoverOfflineJudge({ slotsFile, journal: retained.journal, token: failed.token, revision: failed.revision, incidentToken: retained.token }, fixture.lockRoot))
      .toMatchObject({ status: "released" })
    const released = await Bun.file(files[0]!).json()
    expect(released).toMatchObject({ state: "released", revision: failed.revision + 1 })
    expect(released.lineage[0].token).toBe(retained.token)
    expect(await Bun.file(calibration).text()).toBe(bytes)
    expect(await Bun.file(trace).text()).toBe(calls)
    const reservationBytes = await Bun.file(files[0]!).text()
    expect(await recoverOfflineJudge({ slotsFile, journal: retained.journal, token: failed.token, revision: failed.revision, incidentToken: retained.token }, fixture.lockRoot))
      .toMatchObject({ status: "already_released" })
    expect(await Bun.file(files[0]!).text()).toBe(reservationBytes)
    expect((await runOfflineJudge(loadConfig(["--calibrate", "--only", "group-sum-qty"], env), fixture.lockRoot)).judgeCleanupConfirmed).toBe(true)
    const nextReservationBytes = await Bun.file(files[0]!).text()
    expect(await recoverOfflineJudge({ slotsFile, journal: retained.journal, token: retained.token, revision: retained.revision }, fixture.lockRoot))
      .toMatchObject({ status: "already_released" })
    expect(await Bun.file(files[0]!).text()).toBe(nextReservationBytes)
    const completed = await Bun.file(retained.journal).json(), completedProof = await Bun.file(completed.recovery.proof.path).json()
    const invalidProof = { ...completedProof, token: null, revision: null }
    await writeLeaseReceipt(completed.recovery.proof.path, invalidProof)
    await writeLeaseReceipt(retained.journal, { ...completed, recovery: { ...completed.recovery, released: { token: null, revision: null },
      proof: { ...completed.recovery.proof, sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(invalidProof)).digest("hex") } } })
    await expect(recoverOfflineJudge({ slotsFile, journal: retained.journal, token: retained.token, revision: retained.revision }, fixture.lockRoot))
      .rejects.toThrow("JUDGE_RECOVERY_PROOF_INVALID")
    expect(await Bun.file(files[0]!).text()).toBe(nextReservationBytes)
  } finally { if (confirmed) await rm(root, { recursive: true, force: true }) }
}, 30000)
