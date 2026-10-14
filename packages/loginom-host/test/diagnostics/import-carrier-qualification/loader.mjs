import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,symlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const [consumer,loaderFile,rawOutput,phase]=process.argv.slice(2),out=resolve(rawOutput),root=join(consumer,'resources/loginom');await mkdir(out,{recursive:true});
const {loadPrivateCaptureResource:load}=await import(pathToFileURL(loaderFile));
const manifest=JSON.parse(await readFile(join(root,'resource-manifest.json'),'utf8'));
const kind='import-before-configure-v1',path='runtime/src/acceptance/import-preconfig-adapter-v1.mjs';
const results=[];
const loaded=await load(root,manifest,kind);assert.equal(loaded.resource.path,path);assert.equal(typeof loaded.harness,'function');assert.equal(loaded.registration.mode,'readonly');assert.equal(typeof loaded.registration.validate,'function');
results.push({name:'accepted71-fixed-registration-export-shape',pass:true,resource:loaded.resource,nativeAuthority:false,providerCreationPacket:false,sampleDispatch:0});
for(const [name,kindArg,files] of [
 ['foreign-purpose','field-parameters-preservation-v1',manifest.files],
 ['foreign-resource-path',kind,manifest.files.filter(f=>f.path!==path)],
 ['foreign-resource-sha',kind,manifest.files.map(f=>f.path===path?{...f,sha256:'0'.repeat(64)}:f)],
]){await assert.rejects(load(root,{...manifest,files},kindArg),/LOGINOM_CAPTURE_UNAVAILABLE/);results.push({name,pass:true,sampleDispatch:0,nativeAuthority:false})}
for(const mode of ['foreign-export','foreign-file-symlink']){
 const fixture=await mkdtemp(join(out,mode+'-'));await mkdir(join(fixture,'runtime/src/acceptance'),{recursive:true});
 const bytes=Buffer.from("export const captureMode='readonly';export function validateCaptureResult(){};export function captureForeign(){throw Error('FIXTURE_DISPATCH_FORBIDDEN')}\n");
 const file=join(fixture,path);if(mode==='foreign-export')await writeFile(file,bytes);else{const foreign=join(fixture,'outside.mjs');await writeFile(foreign,bytes);await symlink(foreign,file)}
 const item={path,sha256:createHash('sha256').update(bytes).digest('hex')};
 await assert.rejects(load(fixture,{files:[item]},kind),/LOGINOM_CAPTURE_UNAVAILABLE/);results.push({name:mode,pass:true,sampleDispatch:0,nativeAuthority:false,labels:'own FS resource/export fault fixture only; no supplied native slot/provider'});
}
await writeFile(join(out,'results.json'),JSON.stringify({phase,pass:results.length,results,sharedCarrierCompatible:false,provider:false,sampleRead:0,record:0,authorities:{native:false,configure:false,clean:false,close:false}},null,2)+'\n');console.log(phase,results.length,'closed Import loader applicability controls PASS');
