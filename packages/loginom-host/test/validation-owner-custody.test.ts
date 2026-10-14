import {beforeAll, afterAll, test, expect} from 'bun:test'
import {mkdtemp, mkdir, writeFile, readFile, readdir, symlink, rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {buildNodeHost} from '../script/build-node-host'
import {launchNodeHost} from '../src/node-client'
import {supervise} from '../src/supervisor'

let directory = '', entry = ''
const node = process.env.LOGINOM_AI_AGENT_TEST_NODE ?? ''
beforeAll(async () => {
  if (!node) throw Error('Pinned Node required')
  directory = await mkdtemp(join(tmpdir(), 'calculator-owner-custody-'))
  entry = process.env.VALIDATION_HOST_ENTRY ?? await buildNodeHost(join(directory, 'host'))
})
afterAll(async () => {if (directory) await rm(directory, {recursive:true, force:true})})
async function fixture(mode: string) {
  const root = join(directory, mode, 'profile'), resources = join(directory, mode, 'resources')
  await mkdir(join(resources, 'runtime/src'), {recursive:true})
  await mkdir(join(resources, 'bin'), {recursive:true})
  await symlink(node, join(resources, 'bin/node'))
  await writeFile(join(resources, 'resource-manifest.json'), JSON.stringify({endpoint:'http://fixture.invalid/mcp'}))
  const program = join(resources, 'runtime/src/managed-entry.mjs')
  await writeFile(program, `
    import {mkdir,writeFile,appendFile,access} from 'node:fs/promises';import {join} from 'node:path';
    const mode=${JSON.stringify(mode)},root=${JSON.stringify(root)};
    let starts=0,closes=0,nativeCalls=0,chat,validation;
    process.on('message',async m=>{
      if(m.operation==='start'){
        starts++;const i=m.input;validation=i.validation;chat=join(i.stateDir,'generations',String(i.generation),'chats',i.chat);
        await mkdir(chat,{recursive:true});await writeFile(join(chat,'original.json'),JSON.stringify({fixture:true,starts,cleanup_complete:false}));
        await appendFile(join(root,'start-events.jsonl'),JSON.stringify({fixture:true,chat})+'\\n');
        process.send(mode.startsWith('start-refusal')||(mode==='readiness-refusal'&&!validation)?{id:m.id,error:'LOGINOM_LOGIN_REJECTED'}:{id:m.id,result:{protocol:1,generation:i.generation,checked:true}});
      }
      if(m.operation==='inspect')process.send({id:m.id,result:{fixture:true,starts,closes,nativeCalls}});
      if(m.operation==='close'){
        closes++;if(!nativeCalls)nativeCalls++;await writeFile(join(root,'calls.json'),JSON.stringify({fixture:true,starts,closes,nativeCalls}));
        const repaired=(mode==='readiness-refusal'&&validation)||await access(join(root,'repair-fixture-storage')).then(()=>true,()=>false);
        if(!repaired){process.send({id:m.id,error:'LOGINOM_RUNTIME_CLEANUP_FAILED'});return;}
        process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
      }
    });
  `)
  return {root,resources,program,async repair(){await writeFile(join(root,'repair-fixture-storage'),'fixture-only')},
    async starts(){return (await readFile(join(root,'start-events.jsonl'),'utf8')).trim().split('\n').length},
    async calls(){return JSON.parse(await readFile(join(root,'calls.json'),'utf8'))}}
}
test('supervisor keeps the first rejection and private original runtime after secondary cleanup refusal', async () => {
  const f=await fixture('start-refusal')
  const failure:any=await supervise({node,entry:f.program,resources:f.resources,stateDir:f.root,
    generation:1,chat:'own',endpoint:'http://fixture.invalid',validation:true,
    connection:{url:'http://fixture.invalid',username:'fixture',password:'',apiKey:'fixture'}}).catch(error=>error)
  expect(failure.message).toBe('LOGINOM_LOGIN_REJECTED')
  expect(failure.cleanupFailure.message).toBe('LOGINOM_RUNTIME_CLEANUP_FAILED')
  expect(Object.keys(failure)).not.toContain('retainedRuntime')
  const original=failure.retainedRuntime
  expect(await original.request('inspect')).toMatchObject({fixture:true,starts:1,closes:1,nativeCalls:1})
  await f.repair();await original.close();expect(await original.exited).toEqual({code:0,signal:null})
  expect(await f.calls()).toMatchObject({starts:1,closes:2,nativeCalls:1})
})
for(const mode of ['start-refusal-host','ready-close-refusal']) test(`same host retains validation, refuses replacement and outer ACK: ${mode}`, async () => {
  const f=await fixture(mode)
  const host=await launchNodeHost({node,entry,root:f.root,resources:f.resources,headless:true})
  const candidate={revision:0,url:'http://fixture.invalid/app/',username:'fixture',apiKey:{operation:'replace',value:'fixture-only'},password:{operation:'empty'}}
  let primary: unknown
  try {
    const failure=await host.request('connection.check',candidate).catch(error=>error)
    expect(failure).toBeInstanceOf(Error)
    if(mode.startsWith('start-refusal'))expect(failure.message).toBe('LOGINOM_LOGIN_REJECTED')
    const before=await f.calls();expect(before.starts).toBe(1)
    await expect(host.request('connection.check',candidate)).rejects.toThrow()
    expect(await f.calls()).toEqual(before)
    expect(await f.starts()).toBe(1)
    const a=host.close(),b=host.close();expect(a).toBe(b)
    await expect(a).rejects.toThrow();await expect(b).rejects.toThrow()
    expect(host.alive).toBe(true)
    const chats=join(f.root,'validation/generations/1/chats')
    expect((await readdir(chats)).length).toBe(1)
    expect(await host.request('connection.status',{})).toMatchObject({state:'unconfigured'})
    await f.repair();await host.close();expect(await host.exited).toEqual({code:0,signal:null})
    expect(await f.calls()).toMatchObject({starts:1,nativeCalls:1})
    expect(await f.starts()).toBe(1)
    expect(await readdir(chats)).toEqual([])
  } catch(error) {primary=error;throw error}
  finally {
    await f.repair()
    try {await host.close()} catch(secondary) {
      if(!primary)throw secondary
      console.error('Native-free fixture teardown secondary:',String(secondary))
    }
  }
},15000)
test('failed readiness startup remains owned even though prepare did not return a handle', async () => {
  const f=await fixture('readiness-refusal')
  const host=await launchNodeHost({node,entry,root:f.root,resources:f.resources,headless:true})
  try {
    const checked:any=await host.request('connection.check',{revision:0,url:'http://fixture.invalid/app/',username:'fixture',apiKey:{operation:'replace',value:'fixture-only'},password:{operation:'empty'}})
    await host.request('connection.save',{revision:0,validationId:checked.validationId})
    expect(await f.starts()).toBe(2)
    await expect(host.close()).rejects.toThrow();expect(host.alive).toBe(true)
    const view:any=await host.request('connection.status',{})
    await expect(host.request('connection.check',{revision:view.revision,url:'http://fixture.invalid/app/',username:'fixture',apiKey:{operation:'replace',value:'fixture-only'},password:{operation:'empty'}})).rejects.toThrow()
    expect(await f.starts()).toBe(2)
    await f.repair();await host.close();expect(await host.exited).toEqual({code:0,signal:null})
    expect(await f.starts()).toBe(2)
  } finally {await f.repair();await host.close()}
},15000)
