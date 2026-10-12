import {test,expect,beforeAll,afterAll} from 'bun:test'
import {mkdtemp,mkdir,readFile,writeFile,copyFile,cp,readdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {launchReplacementDiagnostic,launchCalculatorDiagnostic,launchNodeHost} from '../src/node-client'
import {connectionStore} from '../src/connection/connection-store'
import {cliCredentials} from '../src/connection/cli-credentials'
const hash=(b:any)=>createHash('sha256').update(b).digest('hex')
const runtime=resolve(import.meta.dir,'../../loginom-runtime'),repo=resolve(runtime,'../..')
const fixed='runtime/src/acceptance/replacement-input0-readonly-v1.mjs'
let product:string,root:string,files:any[],entry:string,original:string
const child=await readFile(new URL('./support/replacement-registration-child.mjs',import.meta.url),'utf8')
const native=join(repo,'scripts/node-acceptance/tests/fixtures/replacement-capture/fixture.mjs')
const observation=JSON.parse(await readFile(join(repo,'scripts/node-acceptance/tests/fixtures/replacement-capture/mapping-observation.json'),'utf8')).output
const packagePath=observation.package_identity.path,account=packagePath.split('/')[1]
beforeAll(async()=>{
 if(!process.env.LOGINOM_AI_AGENT_TEST_NODE)throw Error('PINNED_NODE_REQUIRED')
 product=await mkdtemp(join(tmpdir(),'replacement-registration-'));root=join(product,'resources/loginom');entry=join(root,'host/node-host.mjs')
 for(const dir of ['bin','host','runtime/src/acceptance','runtime/client/lib'])await mkdir(join(root,dir),{recursive:true})
 await copyFile(process.env.LOGINOM_AI_AGENT_TEST_NODE,join(root,'bin/node'));await writeFile(join(root,'bin/browser'),'offline fixture, never launched')
 await cp(join(runtime,'client/lib'),join(root,'runtime/client/lib'),{recursive:true})
 await copyFile(join(runtime,'src/retained-capture.mjs'),join(root,'runtime/src/retained-capture.mjs'))
 await copyFile(join(runtime,'src/acceptance/replacement-input0-readonly-v1.mjs'),join(root,fixed));original=await readFile(join(root,fixed),'utf8')
 // Genuine whole entry/host/port/supervisor. Managed child is an explicitly
 // labelled loader + native fixture projection, not whole managed startup.
 const build=await Bun.build({entrypoints:[join(import.meta.dir,'../src/node-entry.ts')],target:'node',format:'esm'})
 if(!build.success)throw Error(String(build.logs));await writeFile(entry,await build.outputs[0].text())
 await writeFile(join(root,'runtime/src/managed-entry.mjs'),'const loaderSource='+JSON.stringify(join(runtime,'src/managed-entry.mjs'))+';const resourceVerifier='+JSON.stringify(join(runtime,'src/resources.mjs'))+';const startReader='+JSON.stringify(join(runtime,'src/start-input.mjs'))+';const nativeFixture='+JSON.stringify(native)+';\n'+child)
 files=[]
 async function inventory(dir:string,prefix=''){for(const d of await readdir(dir,{withFileTypes:true})){const p=prefix+d.name;if(d.isDirectory())await inventory(join(dir,d.name),p+'/');else if(p!=='resource-manifest.json')files.push({path:p,sha256:hash(await readFile(join(dir,d.name)))})}}
 await inventory(root)
 await manifest(files)
 await writeFile(join(product,'cli-manifest.json'),JSON.stringify({format:'loginom-cli-artifact-v1',files:[{path:'resources/loginom/host/node-host.mjs',sha256:hash(await readFile(entry))}]}))
 console.log('SOURCE_FIXTURE_PRODUCT '+product)
})
async function manifest(items:any[]){await writeFile(join(root,'resource-manifest.json'),JSON.stringify({protocol:1,endpoint:'https://dock.invalid/mcp',nodeVersion:'24.19.0',node:'bin/node',browser:'bin/browser',files:items}))}
const input=(dir:string)=>({node:join(root,'bin/node'),entry,root:dir,resources:root,headless:true,environment:{},packagePath})
test('actual closed factory → whole host/lease/supervisor IPC → exact loader → fixed native reader/observer',async()=>{
 const directory=join(product,'own-profile');const store=connectionStore(join(directory,'connection'),cliCredentials('linux'))
 await store.stage({generation:3,revision:1,url:'https://loginom.test',username:account,apiKey:'synthetic-only',password:'synthetic-only'});await store.activate(3)
 const host=await launchReplacementDiagnostic(input(directory))
 try {
  expect(await host.request('acquire',{run:'registration-run',session:'own-source-session'})).toEqual({generation:3})
  await expect(host.request('acceptance.capture',{run:'registration-run',authorization:'b'.repeat(64)})).rejects.toThrow();
  const result:any=await host.capture('registration-run');expect(result.diagnosticRead).toBe(true);expect(result.cleanupComplete).toBe(false)
  expect(result.receipt.status).toBe('DIAGNOSTIC_READ');expect(result.receipt.effect_possible).toBe(false);expect(result.receipt.admission_confirmed).toBe(false)
  expect(result.receipt.publication.account).toBe(account);expect(result.receipt.publication.package_path).toBe(packagePath);expect(result.receipt.publication.generation).toBe(3)
  expect(result.receipt.publication.lease).toBe(result.receipt.publication.owner+':registration-run');expect(result.receipt.publication.chat).toBe(hash('own-source-session'))
  expect(result.receipt.root.node_id).toBe(result.receipt.publication.node_id)
  await expect(host.capture('registration-run')).rejects.toThrow()
  await expect(host.request('release',{run:'registration-run'})).rejects.toThrow()
 }finally{await host.close().catch(e=>console.log('FIXTURE_RECOVERY_RETAINED '+e.message));await host.exited}
},20000)
for(const scenario of ['valid','native-error','undefined','null','false','zero','empty','late-owner','dirty','running','unknown-running','input0','opening'])test('whole managed/bridge/executor registration '+scenario,async()=>{
 const entryPath=join(root,'runtime/src/managed-entry.mjs'),projection=await readFile(entryPath,'utf8')
 const sdk=process.env.REPLACEMENT_FIXTURE_SDK;if(!sdk)throw Error('EXPLICIT_FIXTURE_SDK_REQUIRED')
 await cp(join(runtime,'src'),join(root,'runtime/src'),{recursive:true})
 await cp(join(runtime,'examples'),join(root,'runtime/examples'),{recursive:true})
 await mkdir(join(root,'runtime/executor/catalog'),{recursive:true});await copyFile(join(runtime,'executor/catalog/actions.json'),join(root,'runtime/executor/catalog/actions.json'))
 await copyFile(join(runtime,'src/managed-entry.mjs'),join(root,'runtime/src/managed-entry-core.mjs'))
 await copyFile(join(runtime,'client/package.json'),join(root,'runtime/client/package.json'))
 const {symlink}=await import('node:fs/promises');await symlink(sdk,join(root,'runtime/client/node_modules'),'dir').catch(e=>{if(e.code!=='EEXIST')throw e})
 const bootstrap=await readFile(new URL('./support/replacement-whole-managed.mjs',import.meta.url),'utf8')
 await writeFile(entryPath,'import {writeFileSync as fixtureLog} from '+JSON.stringify('node:fs')+";process.on('uncaughtExceptionMonitor',e=>fixtureLog("+JSON.stringify(join(root,'whole-boot-error.txt'))+",e.stack));\n"+'const fixtureScenario='+JSON.stringify(scenario)+';const runtimeRoot='+JSON.stringify(join(root,'runtime'))+';const nativeFixture='+JSON.stringify(native)+';\n'+bootstrap)
 const originalFiles=files;files=[]
 async function inventory(dir:string,prefix=''){for(const d of await readdir(dir,{withFileTypes:true})){const p=prefix+d.name;if(d.name==='node_modules'||p==='resource-manifest.json'||p.startsWith('fixture-')||p.startsWith('loaded-'))continue;if(d.isDirectory())await inventory(join(dir,d.name),p+'/');else files.push({path:p,sha256:hash(await readFile(join(dir,d.name)))})}}
 await inventory(root);await manifest(files)
 const directory=join(product,'whole-profile-'+scenario),store=connectionStore(join(directory,'connection'),cliCredentials('linux'))
 await store.stage({generation:3,revision:1,url:'https://loginom.test',username:account,apiKey:'synthetic-only',password:'synthetic-only'});await store.activate(3)
 let host:any
 try {
  host=await launchReplacementDiagnostic(input(directory));expect(await host.request('acquire',{run:'whole-run',session:'whole-source-session'})).toEqual({generation:3})
  const proof=JSON.parse(await readFile(join(repo,'scripts/node-acceptance/tests/fixtures/replacement-capture/native-node-context.json'),'utf8')).binding
  const call=(name:string,args:any)=>host.request('call',{run:'whole-run',name,args,userMessage:'offline fixture'})
  const request={operation_id:'whole-node',contract_revision:'1.0.0',document_id:proof.document_id,workflow_ref:{workflow_id:proof.workflow_ref.workflow_id},target:{kind:'existing',ref:proof.node,type:'transform.replace_columns'},inputs:[],mode:'exact',parameters:{},finish:'done'}
  for(const [name,args] of [['dock_prepare',{}],['dock_node_apply',request],['dock_node_wait',{operation_id:'whole-node',timeout_ms:1000}],['dock_action_run',{action_key:'package.save_checkpoint',parameters:{path:packagePath,conflict_policy:'fail'},operation_id:'fixture-save'}]] as any){const r=await call(name,args);console.log('WHOLE_STEP '+name+' '+JSON.stringify(r));expect(r.isError).toBeUndefined()}
  const result:any=await host.capture('whole-run');console.log('WHOLE_CAPTURE '+scenario+' '+JSON.stringify(result));expect(result.cleanupComplete).toBe(false);
  if(scenario==='valid'){expect(result.diagnosticRead).toBe(true);expect(result.receipt.effect_possible).toBe(false);expect(result.receipt.admission_confirmed).toBe(false);expect(result.receipt.publication.opening_operation_id).not.toBe(result.receipt.native_before.input_port.opening_operation_id)}
  else {expect(result.refused).toBe(true);expect(result.diagnosticRead).toBeUndefined();if(scenario==='undefined')expect(result.rejectedIsUndefined).toBe(true);if(['null','false','zero','empty'].includes(scenario))expect(result.rejected).toBe(({null:null,false:false,zero:0,empty:''} as any)[scenario]);if(scenario==='native-error'){expect(result.rejected.message).toBe('FIXTURE_PRIMARY');expect(result.rejected.cause).toEqual({kind:'value',value:0,is_undefined:false})}}
  await expect(host.capture('whole-run')).rejects.toThrow();await expect(host.request('release',{run:'whole-run'})).rejects.toThrow()
 }finally {await host?.close().catch((e:any)=>console.log('WHOLE_FIXTURE_RECOVERY '+e.message));if(host)await host.exited;await writeFile(entryPath,projection);files=originalFiles;await manifest(files)}
},30000)
for(const scenario of ['missing','duplicate','hash','link','directory','wrong-export','wrong-mode','missing-validator','foreign-path'])test('fixed registration inventory '+scenario,async()=>{
 let items=files.map(f=>({...f}));const item=items.find(f=>f.path===fixed)
 if(scenario==='missing')items=items.filter(f=>f.path!==fixed);if(scenario==='duplicate')items.push({...item});if(scenario==='hash')item.sha256='0'.repeat(64);if(scenario==='link')item.link='foreign';if(scenario==='directory')item.directory=true
 if(scenario==='foreign-path')item.path='runtime/acceptance/replacement-input0-readonly-v1.mjs'
 if(['wrong-export','wrong-mode','missing-validator'].includes(scenario)){const bytes='export const '+(scenario==='wrong-export'?'captureCalculator':'captureReplacement')+'=()=>{};export const captureMode='+JSON.stringify(scenario==='wrong-mode'?'foreign':'readonly')+';'+(scenario==='missing-validator'?'':'export const validateCaptureResult=()=>true;');await writeFile(join(root,fixed),bytes);item.sha256=hash(bytes)}
 await manifest(items)
 let host:any
 const directory=join(product,'bad-'+scenario)
 if(['wrong-export','wrong-mode','missing-validator'].includes(scenario)){
  const store=connectionStore(join(directory,'connection'),cliCredentials('linux'));await store.stage({generation:3,revision:1,url:'https://loginom.test',username:account,apiKey:'synthetic-only',password:'synthetic-only'});await store.activate(3)
 }
 try{host=await launchReplacementDiagnostic(input(directory));if(['wrong-export','wrong-mode','missing-validator'].includes(scenario)){await host.request('acquire',{run:'bad-run',session:'bad-session'});await host.capture('bad-run')}throw Error('UNEXPECTED_REGISTRATION')}
 catch(e:any){expect(e.message).toBe(['wrong-export','wrong-mode','missing-validator'].includes(scenario)?'LOGINOM_HOST_REQUEST_FAILED':'LOGINOM_HANDSHAKE_INVALID')}
 finally{await host?.close().catch(()=>{});await writeFile(join(root,fixed),original);await manifest(files)}
},20000)
test('structural registration cannot bypass factory',async()=>{await expect(launchNodeHost({...input(join(product,'forged')),acceptanceCapture:{authorization:'a'.repeat(64),packagePath,harness:'replacement-input0-readonly-v1'}} as any)).rejects.toThrow('LOGINOM_HANDSHAKE_INVALID')})
test('Calculator factory does not select Replacement resource',async()=>{await expect(launchCalculatorDiagnostic(input(join(product,'calculator')))).rejects.toThrow('LOGINOM_HANDSHAKE_INVALID')})
afterAll(()=>console.log('FS_FIXTURE_RETAINED '+product))
