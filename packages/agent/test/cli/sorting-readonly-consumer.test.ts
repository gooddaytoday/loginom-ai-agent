import {test, expect} from "bun:test"
import {EventEmitter} from "node:events"
import {LoginomHost} from "../../../loginom-host/src/adapter"
import {loginomHostPort} from "../../../loginom-host/src/host-port"

// Consumer-only preparation. Adapter/transport are real. The upstream port is
// a scripted future SOURCE result, not an implementation of authority guards.
// Dispatch/publication counts below are supplied upstream expectations. These
// cases prove caller sequencing/retention; they do not prove those guards.
type Step = {dispatch: boolean; publish: boolean; refused?: boolean; awaitDrift?: boolean}
function scripted(steps: Step[], primary: unknown) {
  const incoming = new EventEmitter(), methods: string[] = [], calls: any[] = []
  const page = {}, context = {}, bridge = {}, session = {}, writer = {}, journal = {}
  const owner = {deferRelease:true, leases:new Set<any>()}
  const original = {page,context,bridge,session,writer,journal,primary}
  const gate = Promise.withResolvers<void>(), started = Promise.withResolvers<void>()
  let dispatches = 0, publications = 0, run: string | undefined
  const port = {
    on:incoming.on.bind(incoming), start() {},
    postMessage(data: any) {
      methods.push(data.method)
      void (async () => {
        if (data.method === "acquire") {run=data.input.run; incoming.emit("message",{data:{id:data.id,result:{generation:7}}});return}
        if (data.method !== "call" || data.input.run !== run) throw Error("Unexpected consumer request")
        calls.push(data.input)
        const step = steps[calls.length-1]
        if (!step) throw Error("Consumer replay")
        if (step.dispatch) dispatches++
        if (step.awaitDrift) {started.resolve(); await gate.promise}
        if (step.publish) publications++
        incoming.emit("message",{data:{id:data.id,result:step.refused
          ? {isError:true,reason:"scripted upstream authority refusal",primary}
          : {observation:page,context}}})
      })().catch(error => incoming.emit("message",{data:{id:data.id,error:String(error)}}))
    },
  }
  LoginomHost.connect(port, owner)
  return {owner,original,methods,calls,gate,started,get dispatches(){return dispatches},get publications(){return publications}}
}
async function twoReads(lease: NonNullable<Awaited<ReturnType<typeof LoginomHost.acquire>>>) {
  const observations: unknown[] = []
  for (let i=0;i<2;i++) {
    const value: any = await lease.call("dock_workspace_observe",{scope:"all"},"retained consumer")
    if (value?.isError === true) return {observations,refusal:value}
    observations.push(value)
  }
  return {observations}
}
for (const [label,steps,dispatches,publications] of [
  ["SAME qualified owner",[{dispatch:true,publish:true},{dispatch:true,publish:true}],2,2],
  ["invalid original tuple before first read",[{dispatch:false,publish:false,refused:true}],0,0],
  ["tuple drift during first await",[{dispatch:true,publish:false,refused:true,awaitDrift:true}],1,0],
  ...["client","bridge","session"].map(field => [`${field} replacement between reads`,
    [{dispatch:true,publish:true},{dispatch:false,publish:false,refused:true}],1,1]),
  ...["pending","UNKNOWN","RUNNING","foreign identity","storage failure","native-dispatched refusal"].map(state =>
    [state+" not qualified",[{dispatch:false,publish:false,refused:true}],0,0]),
] as [string,Step[],number,number][]) test("consumer connected script: "+label,async()=>{
  const primary=Error("CONFIRMED_SAVE_REQUIRED",{cause:0}), f=scripted(steps,primary)
  try {
    const saved={...f.original}
    const lease = (await LoginomHost.acquire("original chat"))!
    const work = twoReads(lease)
    if (steps[0].awaitDrift) {await f.started.promise;expect(f.publications).toBe(0);f.gate.resolve()}
    const result=await work
    expect(f.dispatches).toBe(dispatches);expect(f.publications).toBe(publications)
    expect(f.calls.length).toBe(steps.length)
    expect(new Set(f.calls.map(c=>c.run)).size).toBe(1)
    expect(f.calls.every(c=>c.name==="dock_workspace_observe" && c.args.scope==="all")).toBe(true)
    expect(f.methods.filter(m=>m==="acquire").length).toBe(1)
    if (result.refusal) expect(result.refusal.primary).toBe(primary)
    await lease.release()
    expect(f.owner.leases.has(lease)).toBe(true)
    expect(f.methods.includes("release")).toBe(false)
    expect(f.original.primary).toBe(primary)
    for (const key of Object.keys(saved) as (keyof typeof saved)[]) expect(f.original[key]).toBe(saved[key])
  } finally {f.gate.resolve();LoginomHost.disconnect()}
})
for (const primary of [Error("first refusal",{cause:0}),null,undefined,false,0,""]) test("consumer retains exact primary "+String(primary),async()=>{
  const f=scripted([{dispatch:false,publish:false,refused:true}],primary)
  try {
    const lease=(await LoginomHost.acquire("original chat"))!
    const r=await twoReads(lease)
    expect(Object.is(r.refusal.primary,primary)).toBe(true)
    expect(Object.is(f.original.primary,primary)).toBe(true)
    expect(f.calls.length).toBe(1);expect(f.dispatches).toBe(0)
    await lease.release();expect(f.owner.leases.has(lease)).toBe(true)
  } finally {LoginomHost.disconnect()}
})

test("current b75 actual HostPort cannot consume qualified readonly result without pending admission",async()=>{
  const requests=new EventEmitter(),replies=new EventEmitter(),pending:string[]=[],events:string[]=[]
  const service={acquire:()=>({generation:7,release(){events.push("release")},holdRecovery(){events.push("hold")},reconciled(){}}),
    async retireRuntime(){},resetRestarts(){},markRuntimeStale(){events.push("stale")},recoveries:new Map(),
    journal:{pending:()=>pending,async begin(){pending.push("id");return "id"},async settle(_id:string,confirmed:boolean){if(confirmed)pending.length=0}},
    async runtime(){return {async request(){events.push("producer");return {result:{isError:true},recoveryPending:true,activeWork:false,readonlyContinuation:true}}}}}
  const host=loginomHostPort({on:requests.on.bind(requests),start(){},postMessage:data=>replies.emit("message",{data})},service as any)
  const owner={deferRelease:true,leases:new Set<any>()}
  LoginomHost.connect({on:replies.on.bind(replies),start(){},postMessage:data=>requests.emit("message",{data})},owner)
  try {
    const lease=(await LoginomHost.acquire("original"))!
    await lease.call("dock_workspace_observe",{scope:"all"},"readonly")
    expect(pending).toEqual(["id"]);expect(events).toContain("stale")
    await expect(lease.call("dock_workspace_observe",{scope:"all"},"readonly")).rejects.toThrow("LOGINOM_RECOVERY_REQUIRED")
    expect(events.filter(e=>e==="producer").length).toBe(1)
    await expect(host.close()).rejects.toThrow("LOGINOM_RECOVERY_REQUIRED")
    expect(events.includes("release")).toBe(false)
  } finally {LoginomHost.disconnect()}
})
