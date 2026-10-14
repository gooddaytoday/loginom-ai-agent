import {test,expect} from "bun:test"
import {closedRouteArguments,verifyClosedSettlement} from "../src/lab57-closed-route"
import type {ClosedSettlement} from "../src/lab57-closed-route"
test("closed executable rejects ambiguous commands before reading any private input",()=>{
  for(const args of [[],["apply"],["execute","/missing","--unsafe"],["worker","/missing","--retry"],["recover","/missing"]])
    expect(()=>closedRouteArguments(args)).toThrow("CLOSED_ROUTE_ARGUMENTS")
  expect(closedRouteArguments(["plan"])).toEqual({command:"plan",file:null})
})
function settlement():ClosedSettlement{return {operation:"LAB57-closed-owned-v1",originalOutcome:"ERROR",quality:"EXCLUDED",sourceSha:"a".repeat(40),
  cessation:{status:"SERVER_OWNERSHIP_SCOPE_CEASED",ownerTask:"01a1375d-ce4a-7c35-a3a3-94cf64a8b589",originalOutcome:"ERROR",cleanup:"UNCONFIRMED"},
  logout:{status:"OWN_DIAGNOSTIC_LOGGED_OUT",observerKey:"own",account:"trusted",document:"NOT_PRESENT_UNPREPARED_OBSERVER",emptyPackages:true},
  process:{status:"confirmed",observation_mode:"continuous",capture_complete:true,error:null,unknownProcesses:[],verification:[{owned_remaining:0,observed_at:"2026-10-14T00:00:00Z"},{owned_remaining:0,observed_at:"2026-10-14T00:00:01Z"}]},
  history:{status:"OFFICIAL_HISTORY_VERIFIED",assistantRows:77,model:"openai/gpt-6-luna/high",originalRowsPreserved:true,coherentSnapshot:true},guard:{status:"RECORD_ARCHIVED"},csv:{status:"OWNED_CSV_REMOVED"}}}
const negatives:Record<string,(s:ClosedSettlement)=>void>={
  "ACK alone":s=>{s.cessation.status="ACK"},"foreign owner":s=>{s.cessation.ownerTask="foreign"},"rewritten ERROR":s=>{s.cessation.originalOutcome="PASS"},
  "synthetic cleanup":s=>{s.cessation.cleanup="confirmed"},"logout missing":s=>{s.logout.status="CLOSED_BROWSER"},"foreign account":s=>{s.logout.account="user"},
  "prepared document":s=>{s.logout.document="foreign-document"},"nonempty observer":s=>{s.logout.emptyPackages=false},
  "unit capture":s=>{s.process.observation_mode="unit_after_exit"},"incomplete capture":s=>{s.process.capture_complete=false},
  "unknown process":s=>{s.process.unknownProcesses=[123]},"failed capture":s=>{s.process.error="failure"},"remaining process":s=>{s.process.verification[1]!.owned_remaining=1},
  "duplicate zero pass":s=>{s.process.verification[1]!.observed_at=s.process.verification[0]!.observed_at},"one zero pass":s=>{s.process.verification.pop()},
  "row loss":s=>{s.history.assistantRows=76},"model changed":s=>{s.history.model="openai/gpt-6-luna/low"},"body loss":s=>{s.history.originalRowsPreserved=false},
  "incoherent WAL":s=>{s.history.coherentSnapshot=false},"guard deletion":s=>{s.guard.status="DELETED"},"foreign CSV":s=>{s.csv.status="CLEARED"}}
for(const [name,alter]of Object.entries(negatives))test(`closed settlement refuses ${name}`,()=>{const s=settlement();alter(s);expect(()=>verifyClosedSettlement(s)).toThrow("GENUINE_CLOSED_SETTLEMENT_REQUIRED")})
test("metadata settlement screening remains separate from genuine private attestation",()=>expect(()=>verifyClosedSettlement(settlement())).not.toThrow())
test("complete Node executable builds, reports source-only plan and refuses execution without private final admission",async()=>{
  const build=await Bun.build({entrypoints:[new URL("../script/lab57-owned-route.ts",import.meta.url).pathname],target:"node",format:"esm"})
  expect(build.success).toBe(true);expect(build.outputs.length).toBe(1)
  const file=process.env.LAB57_SOURCE_PROOF!+"/lab57-owned-route.mjs";await Bun.write(file,build.outputs[0]!)
  for(const args of [["plan"],["execute","/not-admitted"],["worker","/not-admitted"],["admit-helper","/not-admitted"],["--live"],["execute","/not-admitted","--retry"]]){
    const child=Bun.spawn(["/opt/node",file,...args],{stdout:"pipe",stderr:"pipe"})
    const [code,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()])
    expect(code).toBe(args[0]==="plan"?0:2)
    if(args[0]==="plan"){expect(err).toBe("");expect(JSON.parse(out).status).toBe("SOURCE_ONLY_NOT_APPLIED");expect(JSON.parse(out).sourceStageRecoveryEffects).toBe(0)}
    else {expect(out).toBe("");expect(JSON.parse(err).reason).toBe("CLOSED_ROUTE_REFUSED")}
  }
},15000)
