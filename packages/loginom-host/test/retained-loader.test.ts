// PATH-only: genuine closed launcher + IPC + exact managed loader block.
// Resource/host are labelled fixtures; no login, bridge, cleanup or native actions.
import {test,expect} from 'bun:test'
import {mkdtemp,mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {createHash} from 'node:crypto'
const {launchCalculatorDiagnostic}=await import(process.env.CAPTURE_CALLER_BUNDLE??new URL('../src/node-client.ts',import.meta.url).href)
const loader=process.env.PATH_MANAGED_ENTRY??resolve(import.meta.dir,'../../loginom-runtime/src/managed-entry.mjs')
const resourcesModule=process.env.PATH_RESOURCES_MODULE??resolve(import.meta.dir,'../../loginom-runtime/src/resources.mjs')
const fixture=await readFile(new URL('./support/fixed-resource-loader-child.mjs',import.meta.url),'utf8')
const fixed='runtime/src/acceptance/calculator-grouped-before-done-v1.mjs'
const hash=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex')
for(const scenario of ['canonical','missing-validator','bad-mode','missing-resource','duplicate','wrong-export'])test('fixed retained registration loader '+scenario,async()=>{
 const product=await mkdtemp(join(tmpdir(),'fixed-resource-path-')),root=join(product,'resources/loginom');let host:any
 try{
  const node=process.env.LOGINOM_AI_AGENT_TEST_NODE;if(!node)throw Error('Pinned Node required')
  for(const dir of ['bin','host','runtime/src/acceptance','runtime/acceptance'])await mkdir(join(root,dir),{recursive:true})
  await copyFile(node,join(root,'bin/node'));await writeFile(join(root,'bin/browser'),'// no native browser fixture')
  const source=scenario==='wrong-export'?'export const wrongExport=()=>{};':'export const captureCalculator=()=>({marker:"verified-canonical-fixture"});export const captureMode='+JSON.stringify(scenario==='bad-mode'?'foreign':'readonly')+';'+(scenario==='missing-validator'?'':'export const validateCaptureResult=()=>true;')
  const resource=scenario==='wrong-path'?fixed.replace('/src/','/'):fixed
  if(scenario!=='missing-resource')await writeFile(join(root,resource),source)
  // An unverified alternate path must never substitute for the canonical module.
  if(scenario==='canonical')await writeFile(join(root,fixed.replace('/src/','/')),'export const captureCalculator=()=>({marker:"foreign-alternate"});')
  const entry=join(root,'host/node-host.mjs')
  await writeFile(entry,'const loaderSource='+JSON.stringify(loader)+';const resourceVerifier='+JSON.stringify(resourcesModule)+';\n'+fixture)
  const resourceItem={path:resource,sha256:scenario==='wrong-hash'?'0'.repeat(64):hash(source),...(scenario==='link-entry'?{link:'foreign'}:{}),...(scenario==='directory-entry'?{directory:true}:{})}
  const files=[];for(const path of ['bin/node','bin/browser'])files.push({path,sha256:hash(await readFile(join(root,path)))})
  if(scenario!=='missing-resource')files.push(resourceItem);if(scenario==='duplicate')files.push({...resourceItem})
  await writeFile(join(root,'resource-manifest.json'),JSON.stringify({protocol:1,nodeVersion:process.env.PATH_NODE_VERSION??'24.19.0',node:'bin/node',browser:'bin/browser',files}))
  await writeFile(join(product,'cli-manifest.json'),JSON.stringify({format:'loginom-cli-artifact-v1',files:[{path:'resources/loginom/host/node-host.mjs',sha256:hash(await readFile(entry))}]}))
  const input={node:join(root,'bin/node'),entry,root,resources:root,headless:true,environment:{},packagePath:'/user/draft.lgp'}
  if(scenario==='canonical'){
   host=await launchCalculatorDiagnostic(input);const result=await host.capture('retained-run')
   expect(result).toEqual({marker:'verified-canonical-fixture',inventory:fixed,loader:fixed,fixture:true})
  }else {
   await expect(launchCalculatorDiagnostic(input)).rejects.toThrow(['wrong-export','missing-validator','bad-mode'].includes(scenario)?'LOGINOM_HOST_REQUEST_FAILED':'LOGINOM_HANDSHAKE_INVALID')
   if(['wrong-export','missing-validator','bad-mode'].includes(scenario))expect(JSON.parse(await readFile(join(root,'path-loader-refusal.json'),'utf8'))).toEqual({fixture:true,loaded:false,message:'LOGINOM_CAPTURE_UNAVAILABLE'})
  }
 }finally{await host?.close();await rm(product,{recursive:true,force:true})}
},15000)
