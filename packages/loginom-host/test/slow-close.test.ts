import { expect, test } from "bun:test"
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises"
import { tmpdir, homedir } from "node:os"
import { join } from "node:path"
import { supervise } from "../src/supervisor"
import { hostError } from "../src/errors"

// Real child IPC/exit and FS; labelled protocol child, not native cleanup proof.
async function fixture(mode: string) {
  const root = await mkdtemp(join(tmpdir(), "loginom-slow-close-"))
  const entry = join(root, "child.mjs")
  await writeFile(entry, `
    import {writeFileSync} from 'node:fs';
    let closes=0;
    process.on('message',m=>{
      if(m.operation==='start')process.send({id:m.id,result:{protocol:1,ready:true,generation:1,chat:'fixture'}});
      if(m.operation!=='close')return;
      closes++;
      writeFileSync('receipt.json',JSON.stringify({stage:'outer_acknowledgement',status:'allowed',closes}));
      setTimeout(()=>{
        writeFileSync('count.json',JSON.stringify({closes}));
        if(${JSON.stringify(mode)}==='silent')process.exit(0);
        const result=${JSON.stringify(mode)}==='invalid'?{closed:false}:{closed:true};
        process.send({id:m.id,result},()=>{
          process.disconnect();setTimeout(()=>process.exit(${JSON.stringify(mode)}==='badexit'?7:0),100);
        });
      },${mode === 'late' || mode === 'silent' ? 5300 : 20});
    });
  `)
  const runtime = await supervise({
    node: process.env.LOGINOM_TEST_NODE ?? join(homedir(), '.cache/loginom-bootstrap/node/node-v24.19.0-linux-x64/bin/node'),
    entry, resources: root, stateDir: root, generation: 1, chat: 'fixture', endpoint: 'https://fixture.invalid',
    connection: {apiKey:'fixture',password:'',url:'https://fixture.invalid',username:'fixture'},
  })
  return {root,runtime,async finish(){await runtime.exited;await rm(root,{recursive:true})}}
}

test('late original ACK and exit0 succeed without second close', async()=>{
  const f=await fixture('late')
  try {
    const first=f.runtime.close();expect(f.runtime.close()).toBe(first)
    await new Promise(r=>setTimeout(r,5100));expect(f.runtime.close()).toBe(first)
    await first
    expect(JSON.parse(await readFile(join(f.root,'count.json'),'utf8')).closes).toBe(1)
    expect(JSON.parse(await readFile(join(f.root,'receipt.json'),'utf8')).status).toBe('allowed')
    expect(f.runtime.close()).toBe(first)
  } finally {await f.finish()}
},15000)

test('expired silence refuses at original exit without resend',async()=>{
  const f=await fixture('silent')
  try {
    const first=f.runtime.close();const outcome=first.catch(e=>e.message)
    expect(await outcome).toBe('LOGINOM_RUNTIME_TIMEOUT');expect(f.runtime.close()).toBe(first)
    expect(JSON.parse(await readFile(join(f.root,'count.json'),'utf8')).closes).toBe(1)
  } finally {await f.finish()}
},15000)
for(const mode of ['invalid','badexit'])test(`close refuses ${mode} without replay`,async()=>{
  const f=await fixture(mode)
  try {
    const first=f.runtime.close();expect(await first.catch(e=>e.message)).toBe('LOGINOM_RUNTIME_CLEANUP_FAILED')
    expect(f.runtime.close()).toBe(first)
  } finally {await f.finish()}
})
test('setup projection preserves runtime close codes',()=>{
  for(const code of ['LOGINOM_RUNTIME_TIMEOUT','LOGINOM_RUNTIME_CLEANUP_FAILED'])expect(hostError(new Error(code))).toBe(code)
})

for (const code of ['LOGINOM_RUNTIME_TIMEOUT','LOGINOM_RUNTIME_CLEANUP_FAILED']) test(`connection validation retains ${code} and original cause`,async()=>{
  const {connectionService}=await import('../src/connection/connection-service')
  const {connectionStore}=await import('../src/connection/connection-store')
  const root=await mkdtemp(join(tmpdir(),'loginom-close-code-'))
  const original=new Error(code,{cause:false})
  const service=await connectionService(connectionStore(root),{
    async check(){throw original},async prepare(){throw Error('unexpected prepare')},
  })
  try {
    const error=await service.api.check({revision:0,url:'https://fixture.invalid',username:'fixture',
      apiKey:{operation:'replace',value:'fixture'},password:{operation:'empty'}}).catch(e=>e)
    expect(error.message).toBe(code);expect(error.cause).toBe(original);expect(error.cause.cause).toBe(false)
    expect(hostError(error)).toBe(code)
  } finally {await service.close();await rm(root,{recursive:true})}
})
