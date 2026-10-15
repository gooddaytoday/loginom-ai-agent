import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {loadPrivateCaptureResource} from '../../src/private-capture-resource.mjs';
import {validateStartInput} from '../../src/start-input.mjs';
const path='runtime/src/acceptance/import-preconfig-adapter-v1.mjs';
const code="export const captureMode='readonly';export function captureImportPreconfig(){throw Error('must not dispatch')};export function validateCaptureResult(){}";
async function fixture(body=code){
 const root=await mkdtemp(join(tmpdir(),'import-registration-'));await mkdir(join(root,'runtime/src/acceptance'),{recursive:true});await writeFile(join(root,path),body);
 return {root,manifest:{files:[{path,sha256:createHash('sha256').update(body).digest('hex')}]},async close(){await rm(root,{recursive:true,force:true})}};
}
test('fixed Import loader returns frozen readonly registration without dispatch',async()=>{
 const f=await fixture();try{const r=await loadPrivateCaptureResource(f.root,f.manifest,'import-before-configure-v1');
  assert.equal(r.resource.path,path);assert.equal(r.registration.mode,'readonly');assert.equal(r.registration.resource,r.resource);
  assert.equal(Object.isFrozen(r),true);assert.equal(Object.isFrozen(r.registration),true);assert.equal(Object.isFrozen(r.resource),true);
 }finally{await f.close()}
});
for(const fault of ['unknown','missing','duplicate','hash','path','directory','link'])test('fixed loader refuses '+fault,async()=>{
 const f=await fixture();try{let harness='import-before-configure-v1';
  if(fault==='unknown')harness='../../arbitrary';if(fault==='missing')f.manifest.files=[];if(fault==='duplicate')f.manifest.files.push({...f.manifest.files[0]});
  if(fault==='hash')f.manifest.files[0].sha256='0'.repeat(64);if(fault==='path')f.manifest.files[0].path='runtime/src/acceptance/import-before-configure-v1.mjs';
  if(fault==='directory')f.manifest.files[0].directory=true;if(fault==='link')f.manifest.files[0].link='anything';
  await assert.rejects(loadPrivateCaptureResource(f.root,f.manifest,harness));
 }finally{await f.close()}
});
for(const body of ["export function captureImportPreconfig(){}",code+";export function captureCalculator(){}",code.replace('function validateCaptureResult(){}','const validateCaptureResult=null'),code.replace("'readonly'","'write'")])test('unique readonly exports refuse invalid namespace',async()=>{
 const f=await fixture(body);try{await assert.rejects(loadPrivateCaptureResource(f.root,f.manifest,'import-before-configure-v1'))}finally{await f.close()}
});
test('realpath substitution refuses before importing the replacement',async()=>{
 const f=await fixture();try{await writeFile(join(f.root,'replacement.mjs'),code);await rm(join(f.root,path));await symlink(join(f.root,'replacement.mjs'),join(f.root,path));
  await assert.rejects(loadPrivateCaptureResource(f.root,f.manifest,'import-before-configure-v1'));
 }finally{await f.close()}
});
test('Import startup binding retains exact original grant and refuses owner/deadline drift',()=>{
 const capture={revision:1,harness:'import-before-configure-v1',owner:'owner',run:'run',lease:'owner:run',generation:1,chat:'chat',account:'test',packagePath:'/test/result.lgp',admission:'admission',expires:Date.now()+10000};
 const input={protocol:1,generation:1,chat:'chat',stateDir:'/tmp/owned',connection:{username:'test'},acceptanceCapture:capture};
 assert.equal(validateStartInput(input).acceptanceCapture,capture);
 for(const change of [{harness:'arbitrary'},{lease:'foreign:run'},{account:'foreign'},{generation:2},{chat:'foreign'},{expires:Date.now()-1},{packagePath:'/foreign/result.lgp'},{resource:path}])
  assert.throws(()=>validateStartInput({...input,acceptanceCapture:{...capture,...change}}));
});
test('manifest array substitution during module await refuses before returning registration',async()=>{
 const f=await fixture(code+";await Promise.resolve();globalThis.__importLoaderManifest.files=[...globalThis.__importLoaderManifest.files];");
 globalThis.__importLoaderManifest=f.manifest;
 try{await assert.rejects(loadPrivateCaptureResource(f.root,f.manifest,'import-before-configure-v1'))}
 finally{delete globalThis.__importLoaderManifest;await f.close()}
});
