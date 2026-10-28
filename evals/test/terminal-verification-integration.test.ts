import { expect, test } from "bun:test"
import path from "node:path"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { parallelFixture } from "./helpers/parallel-fixture"
import { loadSlots, parseSlots } from "../src/slots"
import { createPair, destroyPair, readServerIdentity, inspectUserStorage, verifyParallelPair } from "../src/parallel-pair"
import { acquireJudgeLease, globalLockRoot, readLeaseReceipt, readResourceReservation, writeLeaseReceipt } from "../src/lease"
import { cancelUnusedVerification } from "../src/terminal-verification"

// Real native user/storage/admin and leases. Campaign/refusal records are fixture inputs;
// this is cancellation qualification, not a benchmark or a real failed verification run.
test.skipIf(!process.env.EVAL_ADMIN_LIVE_CONFIG || !process.env.EVAL_CLI_BIN)("unused verify terminal cancellation closes real native leases without readiness", async () => {
  const source = await loadSlots(process.env.EVAL_ADMIN_LIVE_CONFIG!, 1)
  const root = await mkdtemp(path.join(tmpdir(), "evals-terminal-native-")), fixture = await parallelFixture(root)
  const name = `evals-terminal-${crypto.randomUUID().slice(0, 8)}`
  const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } }), url = `http://127.0.0.1:${listener.port}/app/`
  listener.stop(true)
  const file = parseSlots({ ...fixture.slots, slots: fixture.slots.slots.slice(0, 1),
    server: { ...fixture.slots.server, container: `${name}-server`, studioContainer: `${name}-studio`, network: name, alias: "loginom-server-7.4.2-test", url },
    controller: { ...fixture.slots.controller, adminCredentialsFile: source.controller.adminCredentialsFile } }, 1)
  const options = { purpose: "research" as const, out: path.join(root, "evidence"), lockRoot: globalLockRoot }
  const pair = await createPair(file, options)
  console.error(`terminal native fixture: ${root}`)
  let commandId = crypto.randomUUID(), journal = path.join(file.controller.stateDir, `verify-command-${commandId}.json`)
  await writeLeaseReceipt(journal, { version: 2, kind: "unactivated-preparation", commandId, identity: pair.identity, slotIds: ["a"], phase: "unactivated" })
  const child = Bun.spawn([process.execPath, "--no-env-file", "-e", `
    const {acquireEnvironmentLeases}=await import('./src/slots');
    const {stageUserPreparation}=await import('./src/user-environment');
    const {openLoginomAdmin}=await import('./src/loginom-admin');
    const {prepareUserStorage}=await import('./src/parallel-pair');
    const file=${JSON.stringify(file)},identity=${JSON.stringify(pair.identity)};
    const e=await acquireEnvironmentLeases(file,1,identity,${JSON.stringify(journal)},${JSON.stringify(globalLockRoot)});
    try { const lease=e.slots[0],p=await stageUserPreparation(file,lease,'e'.repeat(64));
      const admin=await openLoginomAdmin(file,identity,{serverLease:e.server,binary:process.env.EVAL_CLI_BIN});
      try { await admin.createBlockedUser(lease,p.secretFile); await prepareUserStorage(file,lease,p.secretFile,e.server); }
      finally { await admin.dispose(); }
    } finally { await e.slots[0].close();await e.server.close(); }
  `], { cwd: path.resolve(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" })
  const output = await new Response(child.stderr).text()
  expect(await child.exited, output).toBe(0)
  const verificationDir = path.join(root, "campaign/verification/check")
  await mkdir(verificationDir, { recursive: true, mode: 0o700 })
  await writeLeaseReceipt(path.join(root, "owner.json"), { campaignId: "campaign" })
  await writeLeaseReceipt(path.join(root, "campaign/journal.json"), { campaignId: "campaign", final: "partial", published: true, verificationDir })
  const receipt = path.join(file.controller.stateDir, `verification-${commandId}.json`)
  const failure = { version: 2, commandId, identity: pair.identity, journal, receipt, status: "quarantined", ready: false, reason: "USER_PREPARATION_CONFLICT" }
  await writeLeaseReceipt(receipt, failure); await writeLeaseReceipt(path.join(verificationDir, "receipt.json"), failure)
  const original = await Bun.file(receipt).text()
  const cancel = () => cancelUnusedVerification(file, { stateRoot: root, campaignId: "campaign" }, process.env.EVAL_CLI_BIN!, globalLockRoot)
  await writeLeaseReceipt(path.join(root, "owner.json"), { campaignId: "foreign" })
  await expect(cancel()).rejects.toThrow("TERMINAL_CAMPAIGN_REQUIRED")
  await writeLeaseReceipt(path.join(root, "owner.json"), { campaignId: "campaign" })
  const canary = path.join(file.slots[0]!.profileDir, "history-canary")
  await Bun.write(canary, "preserve")
  await expect(cancel()).rejects.toThrow("история")
  expect(await Bun.file(canary).text()).toBe("preserve")
  await rm(canary)
  await Bun.$`docker exec ${pair.identity.containerId} sh -c ${"printf preserve > /workdir/UserStorage/eval-a/control"}`.quiet()
  await expect(cancel()).rejects.toThrow("TERMINAL_STORAGE_NOT_EMPTY")
  expect((await Bun.$`docker exec ${pair.identity.containerId} cat /workdir/UserStorage/eval-a/control`.quiet()).text()).toBe("preserve")
  await Bun.$`docker exec ${pair.identity.containerId} rm /workdir/UserStorage/eval-a/control`.quiet()
  let result = await cancelUnusedVerification(file, { stateRoot: root, campaignId: "campaign" }, process.env.EVAL_CLI_BIN!, globalLockRoot)
  expect(await readLeaseReceipt(result.slotProof)).toMatchObject({ terminalOnly: true, storageDeletionAllowed: false, nextAdmissionAllowed: false })
  expect(await Bun.file(receipt).text()).toBe(original)
  for (const key of [`server:${pair.identity.containerId}`, `profile:${file.slots[0]!.profileDir}`])
    expect((await readResourceReservation({ key, lockRoot: globalLockRoot }))?.state).toBe("released")
  expect(await cancelUnusedVerification(file, { stateRoot: root, campaignId: "campaign" }, process.env.EVAL_CLI_BIN!, globalLockRoot)).toEqual(result)
  // Real epoch change on only this owned, already-released research pair.
  // We do not claim account continuity: qualify surrender of owned resources,
  // while leaving original account/preparation/storage receipts unchanged.
  const historicalFiles = ["prepare-a.json", "user-a.json", "storage-a.json"]
  const historical = await Promise.all(historicalFiles.map(name => Bun.file(path.join(file.controller.stateDir, name)).text()))
  await verifyParallelPair(file, pair.identity)
  await Bun.$`docker restart ${pair.identity.containerId} ${pair.identity.studioContainerId}`.quiet()
  const current = await readServerIdentity(file)
  expect(current.containerId).toBe(pair.identity.containerId)
  expect(current.serverEpoch).not.toBe(pair.identity.serverEpoch)
  await verifyParallelPair(file, current)
  commandId = crypto.randomUUID(); journal = path.join(file.controller.stateDir, `verify-command-${commandId}.json`)
  await writeLeaseReceipt(journal, { version: 2, kind: "unactivated-preparation", commandId, identity: current, slotIds: ["a"], phase: "unactivated" })
  const retain = Bun.spawn([process.execPath, "--no-env-file", "-e", `
    const {acquireEnvironmentLeases}=await import('./src/slots');
    const {readUserPreparation}=await import('./src/user-environment');
    const {openLoginomAdmin}=await import('./src/loginom-admin');
    const file=${JSON.stringify(file)},identity=${JSON.stringify(current)};
    const e=await acquireEnvironmentLeases(file,1,identity,${JSON.stringify(journal)},${JSON.stringify(globalLockRoot)});
    try {
      let rejected=false;
      try { await readUserPreparation(file,e.slots[0],file.controller.stateDir+'/prepare-a.secret.json'); }
      catch(error) { if(error.message!=='USER_PREPARATION_CONFLICT') throw error; rejected=true; }
      if(!rejected) throw Error('OLD_PREPARATION_ADMITTED');
      const admin=await openLoginomAdmin(file,identity,{serverLease:e.server,binary:process.env.EVAL_CLI_BIN});
      try { console.log(JSON.stringify(await admin.inspectUserAccount('eval-a'))); }
      finally { await admin.dispose(); }
    } finally { await e.slots[0].close();await e.server.close(); }
  `], { cwd: path.resolve(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" })
  const observedAccount = await new Response(retain.stdout).text(), retainErrors = await new Response(retain.stderr).text()
  expect(await retain.exited, retainErrors).toBe(0)
  expect(JSON.parse(observedAccount).objectId).not.toBe(JSON.parse(historical[1]!).objectId)
  const nextReceipt = path.join(file.controller.stateDir, `verification-${commandId}.json`)
  const nextFailure = { ...failure, commandId, journal, receipt: nextReceipt, identity: current }
  await writeLeaseReceipt(nextReceipt, nextFailure); await writeLeaseReceipt(path.join(verificationDir, "receipt.json"), nextFailure)
  await expect(inspectUserStorage(file, current, file.slots[0]!, crypto.randomUUID())).rejects.toThrow("USER_STORAGE_OWNERSHIP")
  await expect(cancelUnusedVerification({ ...file, server: { ...file.server, network: "foreign-network" } },
    { stateRoot: root, campaignId: "campaign" }, process.env.EVAL_CLI_BIN!, globalLockRoot)).rejects.toThrow()
  expect((await readResourceReservation({ key: `server:${current.containerId}`, lockRoot: globalLockRoot }))?.state).toBe("retained")
  result = await cancel()
  const afterEpochProof = await readLeaseReceipt(result.slotProof)
  expect(afterEpochProof).toMatchObject({ releaseScope: "owned-resources-only", accountIdentityContinuity: false,
    accountMutationAllowed: false, storageDeletionAllowed: false, nextAdmissionAllowed: false })
  expect(await Promise.all(historicalFiles.map(name => Bun.file(path.join(file.controller.stateDir, name)).text()))).toEqual(historical)
  console.error(JSON.stringify({ qualification: "resource-only-after-owned-pair-restart", oldEpoch: pair.identity.serverEpoch,
    currentEpoch: current.serverEpoch, oldObjectId: JSON.parse(historical[1]!).objectId, observedAccount: JSON.parse(observedAccount),
    oldPreparationRefused: true, wrongNonceRefused: true, foreignPairRefused: true, accountContinuityClaimed: false }))
  // The public published-controller path consumes the same terminal proof and releases only its matching owner.
  const { runCampaign } = await import("../script/run-campaign")
  const harnessRoot = path.resolve(import.meta.dir, ".."), manifestFile = path.join(root, "manifest.json"), serverFile = path.join(root, "server.json")
  const manifest = { id: "campaign", server: "runner2", executor: "EvalBaseline", parallel: 1, batchSize: 1,
    keys: [{ corpus: "ordinary", taskId: "saved", round: 1 }], pins: { EVAL_CLI_BIN: process.env.EVAL_CLI_BIN!, EVAL_CLI_MODE: "binary" }, issueId: "fixture", wakeupIds: [] }
  await writeLeaseReceipt(manifestFile, manifest)
  const final = { ...await readLeaseReceipt(path.join(root, "campaign/journal.json")) as object,
    manifestHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(manifest)).digest("hex"), repairing: true, repairer: "EvalBaseline",
    attempts: [{ key: manifest.keys[0], counted: true, score: 100 }], lastProgressAt: 123, startedAttempts: 1 }
  await writeLeaseReceipt(path.join(root, "campaign/journal.json"), final)
  await writeLeaseReceipt(path.join(root, "slots.json"), file)
  await writeLeaseReceipt(path.join(root, "pins.json"), { cli: process.env.EVAL_CLI_BIN,
    cliBinarySha256: new Bun.CryptoHasher("sha256").update(await Bun.file(process.env.EVAL_CLI_BIN!).bytes()).digest("hex") })
  await writeLeaseReceipt(serverFile, { server: "runner2", stateRoot: root, harnessRoot,
    acceptedHarness: (await Bun.$`git rev-parse HEAD`.quiet()).text().trim(), controllerLock: path.join(root, "controller.lock"),
    batchUnit: "getty@tty63.service", batchEnvFile: path.join(root, "unused.env"), resourceBudgetFile: path.join(root, "budget.json"),
    slotsFile: path.join(root, "slots.json"), experimentPinsFile: path.join(root, "pins.json"), corpusPinsFile: path.join(root, "corpus.json"),
    preflightCommand: ["/bin/false"], verifyCommand: ["/bin/false"], multica: {} })
  const judge = await acquireJudgeLease({ codexHome: file.judge.codexHome, journal, commandId, lockRoot: globalLockRoot })
  try {
    const proof = path.join(root, "unused-judge.json"), r = judge.reservation
    await writeLeaseReceipt(proof, { version: 2, status: "confirmed", key: r.key, token: r.token, revision: r.revision })
    await judge.release(proof)
  } finally { await judge.close() }
  const finalized = await runCampaign(manifestFile, serverFile, true, "cancel-unused-verify", "EvalBaseline")
  expect(finalized).toMatchObject({ ...final, cleanupVerified: true })
  expect(await Bun.file(path.join(root, "owner.json")).exists()).toBe(false)
  expect(await Bun.file(path.join(root, "unused.env")).exists()).toBe(false)
  expect(await runCampaign(manifestFile, serverFile, true, "cancel-unused-verify", "EvalBaseline")).toEqual(finalized)
  const terminalProof = await readLeaseReceipt(result.slotProof)
  await destroyPair(file, options)
  await rm(root, { recursive: true })
  expect(terminalProof).toMatchObject({ releaseScope: "owned-resources-only", accountIdentityContinuity: false, accountMutationAllowed: false })
}, 180_000)
