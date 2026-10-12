import {test,expect} from 'bun:test';
import {mkdtemp,readFile,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const mode=process.env.REVIEW_KIND;
const {supervise}=await import(process.env.PREREADY_SUPERVISOR??new URL('../../../../loginom-host/src/supervisor.ts',import.meta.url).href);

test('real private caller IPC refuses overlap with original pending admission',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'reviewer-preready-admit-'));
  const entry=join(directory,'child.mjs');
  const template=await readFile(new URL('./reviewer-concurrency-child.mjs',import.meta.url),'utf8');
  await writeFile(entry,template.replace('const root=ROOT;', 'const root='+JSON.stringify(process.env.PREREADY_RUNTIME_ROOT)+';'));
  await symlink(process.env.PREREADY_CLIENT_MODULES!,join(directory,'node_modules'));
  const runtime=await supervise({node:process.env.PREREADY_NODE!,entry,resources:directory,stateDir:directory,
    generation:7,chat:'original-chat',endpoint:'https://fixture.invalid/mcp',
    connection:{apiKey:'double',password:'double',username:'worker',url:'https://fixture.invalid/app/'}});
  let admission:Promise<unknown>|undefined,read, facts;
  try{
    await writeFile(join(directory,'input.txt'),'');
    admission=runtime.request('admit',{userMessage:'original',files:[{name:'input.txt',bytes:0,
      sha256:'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',sourcePath:join(directory,'input.txt')}]});
    await runtime.request('fixture.admitReady',undefined,2000);
    read=await runtime.readPreReady({signal:new AbortController().signal,deadline:Date.now()+2000})
      .then(result=>({accepted:true,result}),cause=>({accepted:false,cause}));
    await runtime.request('fixture.releaseAdmission');
    const admissionReply=await admission;
    facts=await runtime.request('fixture.exit');
    await runtime.exited;
    console.log(JSON.stringify({mode,read,admissionReply,facts,
      scope:'real supervise/FS/child message IPC and production managed/bridge/admission; Page/auth/SDK/store/native service doubles'}));
    expect(read.accepted).toBe(false);
  }finally{
    if(!facts){
      await runtime.request('fixture.releaseAdmission').catch(()=>undefined);
      await admission?.catch(()=>undefined);
      await runtime.request('fixture.exit').catch(()=>undefined);
      await runtime.exited;
    }
    await rm(directory,{recursive:true,force:true});
  }
});
