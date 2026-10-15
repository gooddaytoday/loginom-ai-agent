import {test,expect} from 'bun:test'
import {mkdtemp,mkdir,writeFile,readFile,copyFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
const {launchImportPreconfigDiagnostic,launchNodeHost}=await import(process.env.IMPORT_CALLER_BUNDLE??new URL('../src/node-client.ts',import.meta.url).href)
const fixed='runtime/src/acceptance/import-preconfig-adapter-v1.mjs'
const hash=(b:string|Uint8Array)=>createHash('sha256').update(b).digest('hex')
// FS and child IPC real. Node host/resource doubles do not assert native/read/Close authority.
for(const fault of ['canonical','missing','duplicate','hash','foreign-path','forged-grant'])test('private Import launcher '+fault,async()=>{
 const product=await mkdtemp(join(tmpdir(),'import-private-launcher-'));let host:any
 const root=join(product,'resources/loginom'),entry=join(root,'host/node-host.mjs')
 try{
  await mkdir(join(root,'runtime/src/acceptance'),{recursive:true});await mkdir(join(root,'host'),{recursive:true});await mkdir(join(root,'bin'),{recursive:true})
  const node=process.env.LOGINOM_AI_AGENT_TEST_NODE;if(!node)throw Error('Pinned Node required')
  await copyFile(node,join(root,'bin/node'))
  const resource="export const captureMode='readonly';export function captureImportPreconfig(){};export function validateCaptureResult(){}"
  await writeFile(join(root,fixed),resource)
  await writeFile(entry,`process.on('message',m=>{if(m.method==='start'){if(m.input.acceptanceCapture?.harness!=='import-before-configure-v1')throw Error('kind lost');process.send({id:m.id,result:{ready:true,protocol:1,pid:process.pid}})}else if(m.method==='acceptance.capture'){process.send({id:m.id,result:{fixture:true,readonly:true,close_authority:false,native_proof:false,...(m.input.request?{request:m.input.request}:{})}})}else if(m.method==='close')process.send({id:m.id,result:{closed:true}},()=>process.disconnect())});`)
  const item={path:fixed,sha256:hash(resource)}
  const files=[{path:'bin/node',sha256:hash(await readFile(join(root,'bin/node')))},...(fault==='missing'?[]:[item])]
  if(fault==='duplicate')files.push({...item});if(fault==='hash')item.sha256='0'.repeat(64);if(fault==='foreign-path')item.path='runtime/src/acceptance/import-before-configure-v1.mjs'
  await writeFile(join(root,'resource-manifest.json'),JSON.stringify({files}))
  await writeFile(join(product,'cli-manifest.json'),JSON.stringify({format:'loginom-cli-artifact-v1',files:[{path:'resources/loginom/host/node-host.mjs',sha256:hash(await readFile(entry))}]}))
  const input={node:join(root,'bin/node'),entry,root,resources:root,headless:true,environment:{},packagePath:'/own/result.lgp'}
  if(fault==='canonical'){
   host=await launchImportPreconfigDiagnostic(input);expect(await host.capture('original-run')).toEqual({fixture:true,readonly:true,close_authority:false,native_proof:false});const original={operation_id:'original-opening',target:{kind:'existing',type:'imports.text'}};expect((await host.capture('original-run',original)).request).toEqual(original)
  }else if(fault==='forged-grant')await expect(launchNodeHost({...input,acceptanceCapture:{harness:'import-before-configure-v1'}})).rejects.toThrow('LOGINOM_HANDSHAKE_INVALID')
  else await expect(launchImportPreconfigDiagnostic(input)).rejects.toThrow('LOGINOM_HANDSHAKE_INVALID')
 }finally{await host?.close();await rm(product,{recursive:true,force:true})}
},15000)
