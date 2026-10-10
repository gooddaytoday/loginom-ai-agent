import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";
const source=await readFile(new URL("../src/managed-entry.mjs",import.meta.url),"utf8");
const body=source.slice(source.indexOf("function close() {"),source.indexOf("const stop ="));
for(const [label,reply] of [["unstarted",undefined],["released",{browser_transport_closed:true}],["refused",{browser_transport_closed:false,package_cleanup:{status:"BLOCKED"}}]])
 test("managed shutdown acknowledgement: "+label,async()=>{
  let calls=0;
  const state={bridge:reply?{close:async()=>{calls++;return reply;}}:undefined};
  const context=vm.createContext({state,requests:new Set(),rm:async()=>{throw Error("unexpected profile deletion");}});
  const close=vm.runInContext(body+";close",context);
  const first=close();assert.equal(close(),first);
  if(label==="refused")await assert.rejects(first,/LOGINOM_RUNTIME_CLEANUP_FAILED/);
  else await first;
  assert.equal(calls,reply?1:0);
 });
