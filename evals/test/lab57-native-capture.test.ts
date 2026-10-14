import {test,expect} from "bun:test"
import {verifyClosedProcessCapture} from "../src/lab57-native-capture"
import type {ProcessCleanup} from "../src/process-supervisor"
import {readFile} from "node:fs/promises"
const directory="/private/diagnostic/loginom/runtime/generations/1/chats/owned/attempts/closed-original"
async function fixture(){
  const input=JSON.parse(await readFile(new URL("./fixtures/lab57-cleanup-proposal/input.json",import.meta.url),"utf8"));const raw=JSON.parse(input.source["txt-semicolon-cp1251-decimal/1/cleanup.json"])
  const p=raw.processes as ProcessCleanup
  p.status="confirmed";p.error=null
  p.selectedCli={executable:"/exact/node",device:64512,inode:3840497}
  const cli=p.processes.find(p=>p.pid===raw.processes.launcher.cli_pid)!
  Object.assign(cli,p.selectedCli)
  p.runtimeDirectories=[directory]
  p.browserBindings?.forEach(b=>{b.runtimeDirectory=directory})
  return p
}
const node={path:"/exact/node",device:64512,inode:3840497}
const negatives:Record<string,(p:ProcessCleanup)=>void>={
  "unit":p=>{p.observation_mode="unit_after_exit"},"unknown":p=>{p.unknownProcesses=[p.processes[0]!]},
  "missing admission":p=>{p.admissions=[]},"denied":p=>{p.admissions![0]!.status="refused"},
  "missing origin":p=>{p.origins=[]},"cycle":p=>{const o=p.origins!.find(o=>o.via!=="launcher")!;o.parent_pid=o.pid;o.parent_starttime=o.starttime},
  "wrong CLI":p=>{p.selectedCli!.inode++},"no browser":p=>{p.browserBindings=[]},"foreign browser directory":p=>{p.browserBindings![0]!.runtimeDirectory="/foreign"},
  "missing runtime":p=>{p.runtimeDirectories=[]},"wrong UID":p=>{p.processes[0]!.uid=0},"duplicate process":p=>{p.processes.push(p.processes[0]!)},
  "no zero passes":p=>{p.verification=[]},"failed launcher":p=>{p.launcher!.ready=false}}
test("offline structural native screening accepts complete ancestry and browser binding, without granting effects",async()=>{
  const p=await fixture();expect(()=>verifyClosedProcessCapture(p,node,directory,"2026-10-13T22:28:17.228Z")).not.toThrow()
})
for(const [label,alter]of Object.entries(negatives))test(`closed native proof rejects ${label}`,async()=>{
  const p=await fixture();alter(p);expect(()=>verifyClosedProcessCapture(p,node,directory,"2026-10-13T22:28:17.228Z")).toThrow("CLOSED_NATIVE_CAPTURE_REQUIRED")
})
