import {writePrivateRecord} from "./lab57-private-record"
const names=new Set(["Error","TypeError","SyntaxError","RangeError","RuntimeError","ObserverRefused","AssertionError","PermissionError","FileNotFoundError","ProcessLookupError","TimeoutError"])
const codes=new Set(["EACCES","EPERM","ENOENT","ESRCH","EEXIST","EIO","ELOOP","ENOTDIR","ETIMEDOUT","ECONNREFUSED"])
const reasons=new Set(["FRESH_GUARD_REFUSED","QUEUE_INVENTORY_REFUSED","QUEUE_LEDGER_REFUSED","ROOT_ACTOR_REQUIRED","FD_OBSERVER_REFUSED","FD_OBSERVER_CAPABILITY_REQUIRED","PRIVATE_RECORD_ROOT","OWNED_COMMAND_FAILED","ORIGINAL_OWNER_CONFIG_CHANGED","FINAL_SOURCE_ADMISSION_REQUIRED","BUNDLED_NODE_REQUIRED","EXECUTABLE_IDENTITY_CHANGED","ADMITTED_SOURCE_OWNER_TASK_REQUIRED","REQUEST_BINDING","REQUEST_PID_REUSED","KERNEL_NODE_PATH","KERNEL_NODE_IDENTITY","NAMESPACE_CHANGED","ROOT_FILE_UNTRUSTED","FD_ROSTER_RACE","PROCESS_ROSTER_OR_IDENTITY_RACE","TWO_PASS_COHERENCE_CHANGED","ROOT_HELPER_BYTES","CONTROLLER_OR_REQUESTER_CHANGED","CONTROLLER_COMMAND","UNCLASSIFIED"])
export function safeException(error:unknown,depth=0):Record<string,unknown> {
 const e=error as {name?:unknown;code?:unknown;message?:unknown;cause?:unknown;signal?:unknown;killed?:unknown}
 const code=typeof e?.code==="number"&&Number.isSafeInteger(e.code)?e.code:typeof e?.code==="string"&&codes.has(e.code)?e.code:null
 return {name:typeof e?.name==="string"&&names.has(e.name)?e.name:"REDACTED_EXCEPTION_NAME",code,
  reason:typeof e?.message==="string"&&reasons.has(e.message)?e.message:"REDACTED_MESSAGE",
  signal:["SIGTERM","SIGKILL","SIGABRT"].includes(String(e?.signal))?e.signal:null,killed:e?.killed===true,
  ...(depth<3&&e?.cause?{cause:safeException(e.cause,depth+1)}:{})}
}
export async function privateDiagnosticRun<T>(root:string,binding:unknown,action:(stage:(s:string)=>Promise<void>)=>Promise<T>):Promise<T> {
 let stage="entry",ordinal=0
 await writePrivateRecord(root,"start.json",{version:1,binding,pid:process.pid,uid:process.getuid!(),at:new Date().toISOString(),status:"STARTED_NOT_ADMITTED"})
 const enter=async(s:string)=>{if(!/^[a-z0-9-]+$/.test(s))throw Error("PRIVATE_STAGE_REQUIRED");stage=s
  await writePrivateRecord(root,`stage-${String(++ordinal).padStart(4,"0")}.json`,{stage,at:new Date().toISOString(),status:"ENTERED_NOT_COMPLETED"})}
 try {const result=await action(enter);await writePrivateRecord(root,"exit.json",{stage,status:"RETURNED",at:new Date().toISOString()});return result}
 catch(error){await writePrivateRecord(root,"refusal.json",{version:1,binding,stage,status:"BLOCKED",exception:safeException(error),originalOutcome:"ERROR",cleanup:"UNCONFIRMED",at:new Date().toISOString()});throw error}
}
