import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { prepareLab57CleanupProposal, validateCapturedLineage } from "../src/lab57-cleanup-proposal"

async function fixture() {
  return JSON.parse(await readFile(new URL("./fixtures/lab57-cleanup-proposal/input.json", import.meta.url), "utf8"))
}

test("LAB57: a current legacy guard birth cannot substitute for captured admission", async () => {
  const input = JSON.parse(await readFile(new URL("./fixtures/lab57-cleanup-proposal/input.json", import.meta.url), "utf8"))
  const result = prepareLab57CleanupProposal(input)
  expect(result.status).toBe("PREPARED")
  expect(result.applied).toBe(false)
  expect(result.readiness).toBe("NOT_READY")
  expect(result.missing).toContain("LEGACY_GUARD_PARENT_BIRTH_UNCAPTURED")
})

test.each([
  ["issue", "foreign"], ["role", "rich"], ["phase", "unit"], ["sha", "c26"], ["acquiredAt", "later"],
  ["device", 1], ["inode", 1], ["containerId", "foreign"], ["endpoint", "http://foreign/"],
  ["raw_owner_sha256", "changed"], ["raw_config_sha256", "changed"], ["configSha256", "changed"],
])("LAB57: refuses changed binding %s", async (field, replacement) => {
  const input = await fixture()
  input.binding[field] = replacement
  expect(prepareLab57CleanupProposal(input).missing).toContain("ORIGINAL_LEASE_BINDING_CHANGED")
})

test.each(["summary.json", "code-verdict.json", "txt-semicolon-cp1251-decimal/1/cleanup.json", "txt-semicolon-cp1251-decimal/1/result.json", "txt-semicolon-cp1251-decimal/1/run.json"])("LAB57: refuses changed source bytes %s", async file => {
  const input = await fixture()
  input.source[file] += " "
  expect(prepareLab57CleanupProposal(input).missing).toContain(`SOURCE_BYTES_CHANGED:${file}`)
})

test.each(["path", "device", "inode", "uid", "mode", "size", "sha256", "mtimeNs", "ctimeNs"])("LAB57: refuses changed registration %s", async field => {
  const input = await fixture()
  input.registration[field] = "changed"
  expect(prepareLab57CleanupProposal(input).missing).toContain("REGISTRATION_BINDING_CHANGED")
})

test.each(["path", "device", "inode", "uid", "mode", "size", "sha256", "mtimeNs", "ctimeNs"])("LAB57: refuses changed guard owner %s", async field => {
  const input=await fixture()
  input.guardOwner[field]="changed"
  expect(prepareLab57CleanupProposal(input).missing).toContain("LEGACY_GUARD_BINDING_CHANGED")
})

test.each(["path", "device", "inode", "uid", "mode"])("LAB57: refuses changed guard %s", async field => {
  const input = await fixture()
  input.guard[field] = "changed"
  expect(prepareLab57CleanupProposal(input).missing).toContain("LEGACY_GUARD_BINDING_CHANGED")
})

test("LAB57: refusing foreign storage and a synthesized harness admission", async () => {
  const input = await fixture()
  input.storage.push({path:"/workdir/UserStorage/user/foreign.csv",identity:"foreign",sha256:"foreign"})
  input.guardAdmission = {kind:"reconstructed",status:"confirmed"}
  const result = prepareLab57CleanupProposal(input)
  expect(result.missing).toContain("FOREIGN_OR_CHANGED_STORAGE")
  expect(result.missing).toContain("SYNTHESIZED_HARNESS_ADMISSION_REFUSED")
})

test("LAB57: complete original capture remains valid, separate from current absence", async () => {
  const input = await fixture()
  const proof = JSON.parse(input.source["txt-semicolon-cp1251-decimal/1/cleanup.json"]).processes
  expect(validateCapturedLineage(proof,input.binding.acquiredAt)).toEqual([])
  const valid = structuredClone(proof)
  valid.status="confirmed"; valid.error=null
  expect(validateCapturedLineage(valid,input.binding.acquiredAt)).toEqual([])
  expect(proof.origins.find((x: {via:string})=>x.via==="launcher").parent_starttime).toBeNull()
})

test.each(["unknown", "incomplete", "unit", "missing-admission", "foreign-uid", "missing-origin", "cycle", "zero-pass", "old-pass", "missing-cli", "duplicate-root"])("LAB57: source lineage refuses %s", async mutation => {
  const input = await fixture()
  const proof = JSON.parse(input.source["txt-semicolon-cp1251-decimal/1/cleanup.json"]).processes
  if(mutation==="unknown") proof.unknownProcesses.push(proof.processes[0])
  if(mutation==="incomplete") proof.capture_complete=false
  if(mutation==="unit") proof.observation_mode="unit_after_exit"
  if(mutation==="missing-admission") proof.admissions.pop()
  if(mutation==="foreign-uid") proof.processes[0].uid=-1
  if(mutation==="missing-origin") proof.origins.pop()
  if(mutation==="cycle") { proof.origins[1].parent_pid=proof.origins[1].pid;proof.origins[1].parent_starttime=proof.origins[1].starttime }
  if(mutation==="zero-pass") proof.verification[0].owned_remaining=1
  if(mutation==="old-pass") proof.verification[0].observed_at="2000-01-01T00:00:00Z"
  if(mutation==="missing-cli") proof.selectedCli.inode++
  if(mutation==="duplicate-root") proof.processes.push(proof.processes[0])
  expect(validateCapturedLineage(proof,input.binding.acquiredAt).length).toBeGreaterThan(0)
})

test.each(["tsv-utf8", "tsv-utf16le", "csv-comma-utf8", "csv-pipe-multiline", "txt-comma-utf8"])("LAB57: genuine earlier confirmed capture %s remains valid", async name => {
  const captures=JSON.parse(await readFile(new URL("./fixtures/lab57-cleanup-proposal/confirmed-captures.json",import.meta.url),"utf8"))
  const input=await fixture()
  expect(captures[name].status).toBe("confirmed")
  expect(validateCapturedLineage(captures[name],input.binding.acquiredAt)).toEqual([])
})

test.each(["present", "reused", "unknown", "foreign-container", "mounted", "fd", "old-observation"])("LAB57: fresh guard %s cannot authorise a plan", async fault => {
  const input=await fixture()
  const fresh={containerId:input.binding.containerId,noMounts:true,queuesClear:true,allProfilesInspected:true,
    sourceAndGuardPidsAbsent:true,relevantInspectionComplete:true,nativeAbsent:true,browsersAndDebuggersAbsent:true,profileFdsAbsent:true,
    writerAbsent:true,foreignProfilesClean:true,storageExact:true,originalBindingUnchanged:true,observedAt:new Date().toISOString(),
    passes:[{remaining:0,reused:0,unknown:0},{remaining:0,reused:0,unknown:0}]}
  if(fault==="present") fresh.passes[0]!.remaining=1
  if(fault==="reused") fresh.passes[0]!.reused=1
  if(fault==="unknown") fresh.passes[0]!.unknown=1
  if(fault==="foreign-container") fresh.containerId="foreign"
  if(fault==="mounted") fresh.noMounts=false
  if(fault==="fd") fresh.profileFdsAbsent=false
  if(fault==="old-observation") fresh.observedAt="2000-01-01T00:00:00Z"
  input.freshOperatorGuards=fresh
  const result=prepareLab57CleanupProposal(input)
  expect(result.missing).toContain("FRESH_OPERATOR_GUARDS_REQUIRED")
  expect(result.applied).toBe(false)
})

test("LAB57: preparation reports every missing operator prerequisite without granting effects", async () => {
  const result = prepareLab57CleanupProposal(await fixture())
  expect(result.missing).toContain("SERVER_CESSATION_UNPROVEN")
  expect(result.missing).toContain("FRESH_OPERATOR_GUARDS_REQUIRED")
  expect(result.applied).toBe(false)
})

test("LAB57: changing the original owner refuses the addressed proposal", async () => {
  const input = await fixture()
  input.binding.task = "another-task"
  expect(prepareLab57CleanupProposal(input).missing).toContain("ORIGINAL_LEASE_BINDING_CHANGED")
})
