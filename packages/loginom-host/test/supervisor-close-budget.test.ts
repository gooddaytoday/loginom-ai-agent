import {test,expect} from 'bun:test';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import {supervise} from '../src/supervisor';
test('real child close can finish after five seconds; ACK and terminal exit are both required',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'own-close-budget-'));
 try{
  const child=await supervise({node:process.env.TEST_NODE!,entry:fileURLToPath(new URL('./fixtures/delayed-close.mjs',import.meta.url)),resources:dir,stateDir:dir,generation:1,chat:'fixture',endpoint:'https://fixture.invalid',connection:{url:'https://fixture.invalid',username:'fixture',password:'',apiKey:''}});
  const t=Date.now();await child.close();expect(Date.now()-t).toBeGreaterThanOrEqual(5500);expect(await child.exited).toEqual({code:0,signal:null});
 }finally{await rm(dir,{recursive:true,force:true})}
},15000);
