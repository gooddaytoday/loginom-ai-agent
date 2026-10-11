import {test,expect} from 'bun:test'
import {mkdtemp,readFile,writeFile,mkdir,copyFile,rm,symlink} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
const {launchAmountDiagnostic}=await import(process.env.CAPTURE_CALLER_BUNDLE??new URL('../src/node-client.ts',import.meta.url).href)
const product=process.env.AMOUNT_PRODUCT
if(product)for(const amount of [true])test('clean actual product launches only its fixed private '+(amount?'Amount':'Calculator')+' resource and refuses unbound capture',async()=>{
 const root=join(product,'resources/loginom'),profile=await mkdtemp(join(tmpdir(),'actual-amount-empty-'))
 let host:any
 try{
 const launch=launchAmountDiagnostic
 host=await launch({node:join(root,'bin/node'),entry:join(root,'host/node-host.mjs'),resources:root,root:profile,headless:true,environment:{},packagePath:'/user/fixed.lgp'})
 await expect(host.capture('foreign-unacquired-run')).rejects.toThrow();await host.close();host=undefined
 }finally{await host?.close();await rm(profile,{recursive:true,force:true})}
},15000)
if(product)for(const scenario of ['missing-host','duplicate-host','host-hash','foreign-entry','node-hash','missing-harness','duplicate-harness','harness-hash','missing-collector','duplicate-collector','collector-hash','foreign-collector'])test('actual fixed Amount receiving refuses before admission: '+scenario,async()=>{
 const temporary=await mkdtemp(join(tmpdir(),'actual-amount-gate-')),root=join(temporary,'resources/loginom'),original=join(product,'resources/loginom')
 try{
 for(const path of ['bin','host','runtime/src/acceptance'])await mkdir(join(root,path),{recursive:true})
 const paths=['bin/node','host/node-host.mjs','runtime/src/acceptance/amount-import-type-v1.mjs','runtime/src/acceptance/ui-scan-collector.mjs']
 for(const path of paths)await copyFile(join(original,path),join(root,path))
 const manifest=JSON.parse(await readFile(join(original,'resource-manifest.json'),'utf8')),cli=JSON.parse(await readFile(join(product,'cli-manifest.json'),'utf8'))
 const h=cli.files.find((f:any)=>f.path==='resources/loginom/host/node-host.mjs')
 if(scenario==='missing-host')cli.files=cli.files.filter((f:any)=>f!==h)
 if(scenario==='duplicate-host')cli.files.push({...h})
 if(scenario==='host-hash')h.sha256='0'.repeat(64)
 for(const [key,path]of [['harness',paths[2]],['collector',paths[3]]]){
 const item=manifest.files.find((f:any)=>f.path===path)
 if(scenario==='missing-'+key)manifest.files=manifest.files.filter((f:any)=>f!==item)
 if(scenario==='duplicate-'+key)manifest.files.push({...item})
 if(scenario===key+'-hash')item.sha256='0'.repeat(64)
 }
 if(scenario==='node-hash')manifest.files.find((f:any)=>f.path==='bin/node').sha256='0'.repeat(64)
 let entry=join(root,paths[1])
 if(scenario==='foreign-entry'){entry=join(temporary,'foreign-host.mjs');await copyFile(join(original,paths[1]),entry)}
 if(scenario==='foreign-collector'){
 await rm(join(root,paths[3]));const foreign=join(temporary,'foreign-collector.mjs');await copyFile(join(original,paths[3]),foreign);await symlink(foreign,join(root,paths[3]))
 }
 await writeFile(join(root,'resource-manifest.json'),JSON.stringify(manifest));await writeFile(join(temporary,'cli-manifest.json'),JSON.stringify(cli))
 await expect(launchAmountDiagnostic({node:join(root,'bin/node'),entry,resources:root,root:join(temporary,'profile'),headless:true,environment:{},packagePath:'/user/fixed.lgp'})).rejects.toThrow('LOGINOM_HANDSHAKE_INVALID')
 await expect(readFile(join(temporary,'profile/connection/connection.json'))).rejects.toThrow()
 }finally{await rm(temporary,{recursive:true,force:true})}
},15000)
