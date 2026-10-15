import {test,expect} from "bun:test"
import {mkdtemp,writeFile,rm} from "node:fs/promises"
import {join} from "node:path"
import {tmpdir} from "node:os"
import {supervise} from "../src/supervisor"
import {launchNodeHost} from "../src/node-client"

for(const layer of ["runtime","host"] as const)
 for(const mode of ["slow","bad-ack","failed-exit","hung-exit"] as const)
  test(`${layer} close grace: ${mode} retains acknowledgement and exit requirements`,async()=>{
   const node=process.env.LOGINOM_AI_AGENT_TEST_NODE
   if(!node)throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
   const directory=await mkdtemp(join(tmpdir(),"loginom-close-grace-")),entry=join(directory,"child.mjs")
   const delay=mode==="slow"?(layer==="runtime"?26000:32000):0
   await writeFile(entry,`process.on('message',m=>{
    const op=m.${layer==="runtime"?"operation":"method"};
    if(op==='start')process.send({id:m.id,result:${layer==="runtime"?"{protocol:1,generation:m.input.generation,chat:m.input.chat,ready:true}":"{protocol:1,pid:process.pid,ready:true}"}});
    if(op==='close')setTimeout(()=>process.send({id:m.id,result:{closed:${mode!=="bad-ack"}}},()=>{
     if(${JSON.stringify(mode)}==='hung-exit')return;
     process.exitCode=${mode==="failed-exit"?1:0};process.disconnect();
    }),${delay});
   });`)
   try{
    const child=layer==="runtime"?await supervise({node,entry,resources:directory,stateDir:directory,generation:1,chat:"close-only",endpoint:"https://example.test",connection:{apiKey:"fixture",password:"",username:"test",url:"https://example.test"}})
     :await launchNodeHost({node,entry,root:directory,resources:directory,headless:true})
    const closing=child.close();expect(child.close()).toBe(closing)
    if(mode==="slow"){
     await closing;expect(await child.exited).toEqual({code:0,signal:null})
    }else{
     const message=layer==="runtime"?"LOGINOM_RUNTIME_CLEANUP_FAILED":"LOGINOM_HOST_CLEANUP_FAILED"
     await expect(closing).rejects.toThrow(message);await expect(child.close()).rejects.toThrow(message)
     const exited=await child.exited
     if(mode==="hung-exit")expect(exited.signal).toBe("SIGKILL")
    }
   }finally{await rm(directory,{recursive:true,force:true})}
  },85000)
