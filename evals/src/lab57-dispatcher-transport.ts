import path from "node:path"
import { constants } from "node:fs"
import { open, lstat, realpath, readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { dispatcherBrowserCode } from "./lab57-dispatcher-browser"
import { dispatcherDigest, dispatcherScope, validateDispatcherInventory, stableDispatcherDecision, verifyDispatcherCessation } from "./lab57-dispatcher"
import type { OriginalBinding, DispatcherSession } from "./lab57-dispatcher"

type CallTool = (request: {name: "browser_run_code_unsafe"; arguments: {code: string}}) => Promise<unknown>
type Envelope = {isError?: boolean; content?: {type: string; text?: string}[]}

/** Only JSON Result; no tools/stdout/error text is propagated into safe receipts. */
export function parseDispatcherResponse(raw: unknown) {
  const r = raw as Envelope
  if (!r || r.isError || !Array.isArray(r.content)) throw Error("TRANSPORT_FAILED")
  const results = r.content.filter(x => x.type === "text" && typeof x.text === "string")
    .flatMap(x => { const s = x.text!.match(/^### Result\n([\s\S]*?)(?:\n### |$)/)?.[1] ?? x.text!;
      try { return [JSON.parse(s) as unknown] } catch { return [] } })
  if (results.length !== 1) throw Error("TRANSPORT_RESULT_AMBIGUOUS")
  return results[0]
}

export async function observeDispatcher(call: CallTool) {
  try {
    return validateDispatcherInventory(parseDispatcherResponse(await call({name:"browser_run_code_unsafe",arguments:{code:dispatcherBrowserCode()}})))
  } catch { throw Error("DISPATCHER_OBSERVATION_UNCONFIRMED") }
}

async function writePrivateExclusive(root: string, name: string, data: string) {
  if (!/^[a-z0-9.-]+$/.test(name) || !path.isAbsolute(root) || await realpath(root) !== root) throw Error("PRIVATE_ONCE_ROOT_REQUIRED")
  const dir = await lstat(root)
  if (!dir.isDirectory() || dir.isSymbolicLink() || dir.uid !== process.getuid!() || (dir.mode & 0o777) !== 0o700)
    throw Error("PRIVATE_ONCE_ROOT_REQUIRED")
  const parent = await open(root,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW)
  try {
    const opened = await parent.stat()
    if (opened.dev !== dir.dev || opened.ino !== dir.ino) throw Error("PRIVATE_DIRECTORY_RACE")
    // Address the open directory fd: a replaced parent pathname cannot redirect the exclusive write.
    const handle = await open(`/proc/self/fd/${parent.fd}/${name}`,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600)
    try { await handle.writeFile(data); await handle.sync() } finally { await handle.close() }
    await parent.sync()
    const after = await lstat(root)
    if (after.dev !== dir.dev || after.ino !== dir.ino || (after.mode&0o777)!==0o700 || after.isSymbolicLink()) throw Error("PRIVATE_DIRECTORY_RACE_ONCE_RETAINED")
  } finally { await parent.close() }
  return path.join(root,name)
}

/** Distinct private wx0600/fsync BEFORE close. No reset/delete/rollback on exception. */
export async function reserveDispatcherClose(root: string, original: OriginalBinding, target: DispatcherSession, inventorySha: string) {
  const data = JSON.stringify({version:1,state:"CONSUMED_BEFORE_EFFECT",issue:dispatcherScope.issue,ownerTask:dispatcherScope.ownerTask,
    originalSha:dispatcherDigest(original),inventorySha,targetSha:dispatcherDigest(target),pid:process.pid,uid:process.getuid!()})+"\n"
  const file = await writePrivateExclusive(root,"lab57-original-dispatcher-close.once",data)
  const info = await lstat(file)
  return {file,sha256:createHash("sha256").update(data).digest("hex"),originalSha:dispatcherDigest(original),targetSha:dispatcherDigest(target),
    device:info.dev,inode:info.ino,size:info.size,mtime:info.mtimeMs,ctime:info.ctimeMs}
}

async function verifyOnce(reservation: Awaited<ReturnType<typeof reserveDispatcherClose>>) {
  const info=await lstat(reservation.file)
  if (!info.isFile() || info.isSymbolicLink() || info.nlink!==1 || info.uid!==process.getuid!() || (info.mode&0o777)!==0o600
    || info.dev!==reservation.device || info.ino!==reservation.inode || info.size!==reservation.size
    || info.mtimeMs!==reservation.mtime || info.ctimeMs!==reservation.ctime
    || createHash("sha256").update(await readFile(reservation.file)).digest("hex")!==reservation.sha256) throw Error("ONCE_CHANGED_NO_EFFECT")
}

/** Invoked ONLY inside a later admitted Ben owned-recovery guard; never acquires/releases a stand. */
export async function runDispatcherBoundary(call: CallTool, original: OriginalBinding, privateOnceRoot: string,
  assertOriginalAdmission: () => Promise<void>) {
  await assertOriginalAdmission()
  const before = await observeDispatcher(call), fresh = await observeDispatcher(call)
  const decision = stableDispatcherDecision(before,fresh,original)
  await writePrivateExclusive(privateOnceRoot,"dispatcher-before.json",JSON.stringify({before,fresh},null,2)+"\n")
  if (decision.status === "OWNERSHIP_SCOPE_ABSENT") {
    const receipt=verifyDispatcherCessation(before,fresh,original)
    await writePrivateExclusive(privateOnceRoot,"dispatcher-cessation.json",JSON.stringify(receipt,null,2)+"\n")
    return receipt
  }
  if (!decision.closePermitted || !decision.target) throw Error(decision.limitation ?? "CLOSE_NOT_PERMITTED")
  await assertOriginalAdmission()
  const reservation=await reserveDispatcherClose(privateOnceRoot,original,decision.target,decision.inventorySha)
  // Reservation is durable even if the final admission fails or transport disappears.
  const effect={possible:false}
  try {
  await assertOriginalAdmission()
  await verifyOnce(reservation)
  const invoke = async () => {
    effect.possible=true
    try { return await call({name:"browser_run_code_unsafe",arguments:{code:dispatcherBrowserCode(decision.target,fresh)}}) }
    catch { throw Error("CLOSE_EFFECT_UNKNOWN_ONCE_SPENT") }
  }
  const response = parseDispatcherResponse(await invoke()) as
    {version?: number; operation?: string; acknowledged?: boolean; before?: unknown; after?: unknown}
  if (response?.version !== 1 || response.operation !== "addressed_close" || response.acknowledged !== true)
    throw Error("CLOSE_EFFECT_OR_ACK_UNKNOWN_ONCE_SPENT")
  const actualBefore = validateDispatcherInventory(response.before), actualAfter = validateDispatcherInventory(response.after)
  if (dispatcherDigest(actualBefore.sessions) !== dispatcherDigest(fresh.sessions) || actualBefore.observer !== fresh.observer)
    throw Error("CLOSE_PRECONDITION_CHANGED_ONCE_SPENT")
  // An ACK or missing browser alone is never cessation. Require full stable post inventory too.
  const post = await observeDispatcher(call)
  stableDispatcherDecision(actualAfter,post,original)
  const receipt=verifyDispatcherCessation(actualBefore,post,original)
  await writePrivateExclusive(privateOnceRoot,"dispatcher-after.json",JSON.stringify({actualBefore,actualAfter,post},null,2)+"\n")
  await writePrivateExclusive(privateOnceRoot,"dispatcher-cessation.json",JSON.stringify(receipt,null,2)+"\n")
  return receipt
  } catch {
    const reason=effect.possible ? "NATIVE_EFFECT_UNCONFIRMED_ONCE_SPENT" : "PRE_EFFECT_GATE_REFUSED_ONCE_RETAINED"
    await writePrivateExclusive(privateOnceRoot,"dispatcher-failure.json",JSON.stringify({version:1,status:"BLOCKED",
      reason,effect_possible:effect.possible,originalSha:decision.originalSha,onceSha256:reservation.sha256,
      originalOutcome:"ERROR",cleanup:"UNCONFIRMED"},null,2)+"\n")
    throw Error(reason)
  }
}
