import {launchReplacementReadOnlyCaller} from '../replacement-readonly-caller'
import {test,expect,beforeAll,afterAll} from 'bun:test'
import {mkdtemp,mkdir,readFile,writeFile,copyFile,cp,readdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {launchReplacementDiagnostic,launchCalculatorDiagnostic,launchNodeHost} from '../../../packages/loginom-host/src/node-client'
import {connectionStore} from '../../../packages/loginom-host/src/connection/connection-store'
import {cliCredentials} from '../../../packages/loginom-host/src/connection/cli-credentials'
const hash=(b:any)=>createHash('sha256').update(b).digest('hex')
const installed=process.env.LOGINOM_ARTIFACT_PATH;if(!installed)throw Error('FULL_MANIFEST_PRODUCT_REQUIRED');const runtime=join(installed,'resources/loginom/runtime'),repo=resolve(import.meta.dir,'../../..')
const fixed='runtime/src/acceptance/replacement-input0-readonly-v1.mjs'
let product:string,root:string,files:any[],entry:string,original:string
const child=await readFile(join(repo,'packages/loginom-host/test/support/replacement-registration-child.mjs'),'utf8')
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
 await copyFile(join(installed,'resources/loginom/host/node-host.mjs'),entry)
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
for(const scenario of ['valid','native-error','undefined','null','false','opening','running','pending','late-owner','missing-opening'])test('new private caller → installed host/consumer '+scenario,async()=>{
 const entryPath=join(root,'runtime/src/managed-entry.mjs'),projection=await readFile(entryPath,'utf8')
 const sdk=process.env.REPLACEMENT_FIXTURE_SDK;if(!sdk)throw Error('EXPLICIT_FIXTURE_SDK_REQUIRED')
 await cp(join(runtime,'src'),join(root,'runtime/src'),{recursive:true})
 await cp(join(runtime,'examples'),join(root,'runtime/examples'),{recursive:true})
 await mkdir(join(root,'runtime/executor/catalog'),{recursive:true});await copyFile(join(runtime,'executor/catalog/actions.json'),join(root,'runtime/executor/catalog/actions.json'))
 await copyFile(join(runtime,'src/managed-entry.mjs'),join(root,'runtime/src/managed-entry-core.mjs'))
 await copyFile(join(runtime,'client/package.json'),join(root,'runtime/client/package.json'))
 const {symlink}=await import('node:fs/promises');await symlink(sdk,join(root,'runtime/client/node_modules'),'dir').catch(e=>{if(e.code!=='EEXIST')throw e})
 const bootstrap=await readFile(join(repo,'scripts/node-acceptance/tests/fixtures/replacement-caller-whole.mjs'),'utf8')
 await writeFile(entryPath,'import {writeFileSync as fixtureLog} from '+JSON.stringify('node:fs')+";process.on('uncaughtExceptionMonitor',e=>fixtureLog("+JSON.stringify(join(root,'whole-boot-error.txt'))+",e.stack));\n"+'const fixtureScenario='+JSON.stringify(scenario)+';const runtimeRoot='+JSON.stringify(join(root,'runtime'))+';const nativeFixture='+JSON.stringify(native)+';\n'+bootstrap)
 const originalFiles=files;files=[]
 async function inventory(dir:string,prefix=''){for(const d of await readdir(dir,{withFileTypes:true})){const p=prefix+d.name;if(d.name==='node_modules'||p==='resource-manifest.json'||p.startsWith('fixture-')||p.startsWith('loaded-'))continue;if(d.isDirectory())await inventory(join(dir,d.name),p+'/');else files.push({path:p,sha256:hash(await readFile(join(dir,d.name)))})}}
 await inventory(root);await manifest(files)
 const directory=join(product,'whole-profile-'+scenario),store=connectionStore(join(directory,'connection'),cliCredentials('linux'))
 await store.stage({generation:3,revision:1,url:'https://loginom.test',username:account,apiKey:'synthetic-only',password:'synthetic-only'});await store.activate(3)
 let host:any;const owner:any={}
 try {
  await launchReplacementReadOnlyCaller({product,root:directory,packagePath,run:'whole-run',session:'whole-source-session',signal:new AbortController().signal,deadline:Date.now()+60000},owner);if(owner.failed)throw owner.error;host=owner.host;expect(await owner.acquire()).toEqual({generation:3})
  const proof=JSON.parse(await readFile(join(repo,'scripts/node-acceptance/tests/fixtures/replacement-capture/native-node-context.json'),'utf8')).binding
  const call=(name:string,args:any)=>host.request('call',{run:'whole-run',name,args,userMessage:'offline fixture'})
  const request={operation_id:'whole-node',contract_revision:'1.0.0',document_id:proof.document_id,workflow_ref:{workflow_id:proof.workflow_ref.workflow_id},target:{kind:'existing',ref:proof.node,type:'transform.replace_columns'},inputs:[],mode:'exact',parameters:{},finish:'done'}
  for(const [name,args] of [['dock_prepare',{}],['dock_node_apply',request],['dock_node_wait',{operation_id:'whole-node',timeout_ms:1000}],['dock_action_run',{action_key:'package.save_checkpoint',parameters:{path:packagePath,conflict_policy:'fail'},operation_id:'fixture-save'}]] as any){const r=await call(name,args);console.log('WHOLE_STEP '+name+' '+JSON.stringify(r));expect(r.isError).toBeUndefined()}
  const original=JSON.parse(await readFile(join(root,'runtime/fixture-original.json'),'utf8'));original.signal=new AbortController().signal;owner.pinOriginal(original);const result:any=await owner.read();console.log('WHOLE_CAPTURE '+scenario+' '+JSON.stringify(result));expect(result.cleanupComplete).toBe(false);
  if(scenario==='valid'){expect(result.diagnosticRead).toBe(true);expect(result.receipt.effect_possible).toBe(false);expect(result.receipt.admission_confirmed).toBe(false);expect(result.receipt.publication.opening_operation_id).not.toBe(result.receipt.native_before.input_port.opening_operation_id)}
  else {expect(result.refused).toBe(true);expect(result.diagnosticRead).toBeUndefined();if(scenario==='undefined')expect(result.rejectedIsUndefined).toBe(true);if(['null','false','zero','empty'].includes(scenario))expect(result.rejected).toBe(({null:null,false:false,zero:0,empty:''} as any)[scenario]);if(scenario==='native-error'){expect(result.rejected.message).toBe('FIXTURE_PRIMARY');expect(result.rejected.cause).toEqual({kind:'value',value:0,is_undefined:false})}}
  await expect(owner.read()).rejects.toThrow('NO_RETRY');await expect(owner.close()).rejects.toThrow('NOT_VERIFIED');expect(owner.gates.native_admission).toBe('not_verified');expect(owner.host).toBe(host);await expect(host.request('release',{run:'whole-run'})).rejects.toThrow()
 }finally {await host?.close().catch((e:any)=>console.log('WHOLE_FIXTURE_RECOVERY '+e.message));if(host)await host.exited;await writeFile(entryPath,projection);files=originalFiles;await manifest(files)}
},30000)
afterAll(()=>console.log('FS_FIXTURE_RETAINED '+product))
