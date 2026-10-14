import {mock} from 'bun:test';
import * as cp from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const actualFork=cp.fork;
const product=process.env.LOGINOM_ARTIFACT_PATH!,out=resolve(process.env.FP_AUTH_OUT!);
await mkdir(out,{recursive:true});
const node=join(product,'resources/loginom/bin/node'),resources=join(product,'resources/loginom'),entry=join(resources,'host/node-host.mjs');
const childFile=join(out,'labelled-child.mjs');
await writeFile(childFile,`import {createHash} from 'node:crypto';import {writeFile} from 'node:fs/promises';const file=process.env.FP_AUTH_RECEIPT;let native=0;process.on('SIGTERM',()=>process.exit(0));process.on('message',async m=>{if(m.method==='fixture.exit'){process.exit(0);return}const cap=m.input?.acceptanceCapture;await writeFile(file,JSON.stringify({method:m.method,native_calls:native,grant_present:!!cap,harness:cap?.harness,grant_length:cap?.authorization?.length,grant_sha256:cap?.authorization?createHash('sha256').update(cap.authorization).digest('hex'):null,package_path:cap?.packagePath,labels:'host/native boundary double; real child IPC and FS'},null,2));if(process.env.FP_AUTH_STOP==='1')process.send({id:m.id,error:'LOGINOM_HANDSHAKE_INVALID'});else process.send({id:m.id,result:{protocol:1,ready:true,pid:process.pid}})});`);
let current:any,children:any[]=[];
const fork=(original:string,args:string[],options:any)=>{
 current.forks++;current.original_entry=original;
 const child=actualFork(childFile,[],{...options,env:{...options.env,FP_AUTH_RECEIPT:current.receipt,FP_AUTH_STOP:current.stop?'1':'0'}});
 const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));children.push({child,exited,current});return child;
};
mock.module('node:child_process',()=>({...cp,fork}));mock.module('child_process',()=>({...cp,fork}));
const source=await import(new URL('../../../src/node-client.ts',import.meta.url).href);
const installed=await import(pathToFileURL(join(out,'installed-node-client.mjs')).href);
const rows:any[]=[];
async function attempt(phase:string,name:string,fn:()=>Promise<any>,stop=true){
 current={phase,name,forks:0,stop,receipt:join(out,phase+'-'+name+'.json')};const row=current;
 try{const result=await fn();row.accepted=true;row.private_read_present=typeof result?.readPreReady==='function';row.capture_present=typeof result?.capture==='function'}catch(e){row.accepted=false;row.error=e instanceof Error?e.message:String(e)}
 const own=children.filter(c=>c.current===row);
 for(const c of own){if(c.child.connected)c.child.send({id:'fixture-exit',method:'fixture.exit',input:{}});row.exit=await c.exited}
 try{row.raw=JSON.parse(await readFile(row.receipt,'utf8'))}catch{}
 rows.push(row);return row;
}
const root=await mkdtemp(join(out,'owner-'));const input={node,resources,entry,root,headless:true,packagePath:'/worker/fp.lgp'};
const good=await attempt('source','verified-inventory',()=>source.launchFieldParametersDiagnostic(input));
if(good.accepted||good.forks!==1||good.raw?.harness!=='field-parameters-preservation-v1'||good.raw?.grant_length!==64||good.exit?.code!==0)throw Error('Source fixed inventory admission did not reach labelled startup boundary');
for(const [name,override]of [['wrong-package',{packagePath:'/foreign/../fp.lgp'}],['wrong-node',{node:entry}],['wrong-host',{entry:node}],['wrong-resource-root',{resources:join(resources,'runtime')}]] as const){const r=await attempt('source',name,()=>source.launchFieldParametersDiagnostic({...input,...override}));if(r.accepted||r.forks!==0)throw Error('Source inventory refusal missing '+name)}
const forged=await attempt('source','submitted-capability',()=>source.launchNodeHost({...input,acceptanceCapture:{authorization:'submitted',harness:'field-parameters-preservation-v1'}}));if(forged.accepted||forged.forks)throw Error('Source JSON granted authority');
const unavailable=await attempt('installed','fixed-FP-route',async()=>{if(typeof installed.launchFieldParametersDiagnostic!=='function')throw Error('FP_FIXED_LAUNCHER_NOT_INSTALLED');return installed.launchFieldParametersDiagnostic(input)});if(unavailable.accepted||unavailable.forks!==0)throw Error('Installed fixed route unexpectedly available');
const denied=await attempt('installed','submitted-capability',()=>installed.launchNodeHost({...input,acceptanceCapture:{authorization:'submitted',harness:'field-parameters-preservation-v1'}}));if(denied.accepted||denied.forks)throw Error('Installed JSON granted authority');
const unprivileged=await attempt('installed','ordinary-extra-fields',()=>installed.launchNodeHost({...input,harness:'field-parameters-preservation-v1',authorization:'submitted'}),false);
if(!unprivileged.accepted||unprivileged.private_read_present||unprivileged.capture_present||unprivileged.raw?.grant_present||unprivileged.forks!==1||unprivileged.exit?.code!==0)throw Error('Installed ordinary caller acquired private authority');
await writeFile(join(out,'results.json'),JSON.stringify({checks:rows.length,rows,installed_FP_authority:false,native_verified:false,resource_guards_reached:false},null,2));console.log(JSON.stringify(rows.map(r=>({phase:r.phase,name:r.name,accepted:r.accepted,forks:r.forks,error:r.error})),null,2));
