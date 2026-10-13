import assert from 'node:assert/strict';import {readFile,mkdir,writeFile,symlink} from 'node:fs/promises';import {join,resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const [rawRoot,rawOutput,phase]=process.argv.slice(2),root=resolve(rawRoot),output=resolve(rawOutput);await mkdir(output,{recursive:true});
const {loadPrivateCaptureResource:load}=await import(pathToFileURL(join(root,'runtime/src/private-capture-resource.mjs')));const original=JSON.parse(await readFile(join(root,'resource-manifest.json'),'utf8'));const results=[];
for(const mode of ['fixed','foreign-purpose','missing','duplicate','foreign-hash','escaped-link']){
 const manifest=structuredClone(original),path='runtime/src/acceptance/import-preconfig-adapter-v1.mjs';let failed=false,value;
 if(mode==='missing')manifest.files=manifest.files.filter(f=>f.path!==path);
 if(mode==='duplicate')manifest.files.push({...manifest.files.find(f=>f.path===path)});
 if(mode==='foreign-hash')manifest.files.find(f=>f.path===path).sha256='0'.repeat(64);
 let inputRoot=root;
 if(mode==='escaped-link'){inputRoot=join(output,'escaped');await mkdir(join(inputRoot,'runtime/src/acceptance'),{recursive:true});await symlink(join(root,path),join(inputRoot,path))}
 try{value=await load(inputRoot,manifest,mode==='foreign-purpose'?'field-parameters-preservation-v1':'import-before-configure-v1')}catch(e){failed=true;assert.match(e.message,/CAPTURE_UNAVAILABLE/)}
 if(mode==='fixed'){assert(!failed);assert.equal(value.registration.mode,'readonly');assert.equal(value.resource.path,path);assert(Object.isFrozen(value.resource));assert.equal(typeof value.harness,'function')}
 else assert(failed,mode);
 results.push({mode,pass:true,native:false,executedHarness:false});console.log(phase,mode,'PASS');
}
await writeFile(join(output,'results.json'),JSON.stringify({phase,cases:results.length,results,ImportProvider:false},null,2)+'\n');
