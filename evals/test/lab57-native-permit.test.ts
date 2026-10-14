import {test,expect} from "bun:test"
import {assertClosedNativePermit} from "../src/lab57-native-permit"
import {connectDispatcherMcp} from "../src/lab57-dispatcher-host"
test("no-op, boolean, forged or replayed callback result cannot authorize a native effect",()=>{
  for(const permit of [undefined,null,true,{node:"24.19.0"},{path:"/opt/node",device:64512,inode:3840497,bytes:125989464,
    sha256:"bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12"}])expect(()=>assertClosedNativePermit(permit)).toThrow("CLOSED_NATIVE_ADMISSION_REQUIRED")
})
test("closed connector rejects a no-op admission before reading configuration or opening native transport",async()=>{
  await expect(connectDispatcherMcp({directory:"/tmp/nonexistent-observer",browserCli:"/no-native",browserConfig:"/no-config"},
    async()=>{}, {directory:"/tmp/nonexistent-observer",sandbox:true})).rejects.toThrow("CLOSED_NATIVE_ADMISSION_REQUIRED")
})
