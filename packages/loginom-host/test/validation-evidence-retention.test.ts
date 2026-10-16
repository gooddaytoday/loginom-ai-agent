import {beforeAll, afterAll, test, expect, mock} from 'bun:test'
import {fork as nativeFork} from 'node:child_process'
import {mkdtemp, mkdir, writeFile, readFile, readdir, symlink, rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {buildNodeHost} from '../script/build-node-host'
const ownedChildren: ReturnType<typeof nativeFork>[] = []
const savedFork = nativeFork
mock.module('node:child_process', () => ({fork: (...args: Parameters<typeof nativeFork>) => {
  const child = savedFork(...args); ownedChildren.push(child); return child
}}))
const {launchNodeHost} = await import('../src/node-client')

// Full host/service/supervisor/child IPC and real filesystem. The managed
// runtime is a finite native-free double; no Page/login/logout is performed.
let directory = '', entry = ''
const node = process.env.LOGINOM_AI_AGENT_TEST_NODE ?? ''
beforeAll(async () => {
  if (!node) throw Error('Pinned Node required')
  directory = await mkdtemp(join(tmpdir(), 'calculator-validation-retention-'))
  entry = process.env.VALIDATION_HOST_ENTRY ?? await buildNodeHost(join(directory, 'host'))
})
afterAll(async () => {if (directory) await rm(directory, {recursive:true, force:true})})
const cases = process.env.VALIDATION_RETENTION_CASES?.split(',') ?? ['success','startup','error','undefined','null','false','zero','empty','lost']
for (const mode of cases) test(`validation evidence remains unless close confirmed: ${mode}`, async () => {
  const root = join(directory, mode, 'profile'), resources = join(directory, mode, 'resources')
  await mkdir(join(resources, 'runtime/src'), {recursive:true})
  await mkdir(join(resources, 'bin'), {recursive:true})
  await symlink(node, join(resources, 'bin/node'))
  await writeFile(join(resources, 'resource-manifest.json'), JSON.stringify({endpoint:'http://fixture.invalid/mcp'}))
  await writeFile(join(resources, 'runtime/src/managed-entry.mjs'), `
    import {mkdir,writeFile} from 'node:fs/promises';import {join} from 'node:path';
    const mode=${JSON.stringify(mode)};let directory;
    process.on('message',async m=>{
      if(m.operation==='start'){
        const i=m.input;directory=join(i.stateDir,'generations',String(i.generation),'chats',i.chat);
        await mkdir(directory,{recursive:true});await writeFile(join(directory,'original.json'),JSON.stringify({fixture:true,mode,cause:0,cleanup_complete:false}));
        process.send(mode==='startup'?{id:m.id,error:'LOGINOM_LOGIN_REJECTED'}:{id:m.id,result:{protocol:1,generation:i.generation,checked:true}});
      }
      if(m.operation==='close'){
        const values={undefined:undefined,null:null,false:false,zero:0,empty:''};
        const result=mode==='success'||mode==='startup'?{closed:true}:{closed:values[mode]};
        if(mode==='lost'){process.disconnect();return;}
        const reply=mode==='error'?{id:m.id,error:'LOGINOM_RUNTIME_CLEANUP_FAILED'}:{id:m.id,result};
        process.send(reply,()=>process.disconnect());
      }
    });
  `)
  const host = await launchNodeHost({node,entry,root,resources,headless:true})
  try {
    const result = await host.request('connection.check',{revision:0,url:'http://fixture.invalid/app/',username:'fixture',
      apiKey:{operation:'replace',value:'fixture-only'},password:{operation:'empty'}}).then(value=>({ok:true,value}),error=>({ok:false,error}))
    expect(result.ok).toBe(mode==='success')
    const chats = join(root, 'validation/generations/1/chats')
    const remaining = await readdir(chats)
    if(mode==='success') expect(remaining).toEqual([])
    else {
      expect(remaining.length).toBe(1)
      expect(JSON.parse(await readFile(join(chats,remaining[0],'original.json'),'utf8'))).toMatchObject({fixture:true,mode,cause:0,cleanup_complete:false})
    }
  } finally {
    try {await host.close(); expect(await host.exited).toEqual({code:0,signal:null})}
    catch (error) {
      // A dead original runtime with unconfirmed cleanup must refuse outer ACK.
      // Teardown kills only our finite native-free fixture host, never Loginom.
      expect(['success','startup']).not.toContain(mode)
      expect(host.alive).toBe(true)
      const child = ownedChildren.at(-1)!; child.kill('SIGKILL')
      expect((await host.exited).signal).toBe('SIGKILL')
    }
  }
}, 15000)
