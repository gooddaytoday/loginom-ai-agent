import {readFile,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';

// Private fixed registration, not a path/opcode supplied by a tool or model.
const registrations=Object.freeze({
 'calculator-grouped-before-done-v1':Object.freeze({path:'runtime/src/acceptance/calculator-grouped-before-done-v1.mjs',entry:'captureCalculator'}),
 'import-before-configure-v1':Object.freeze({path:'runtime/src/acceptance/import-preconfig-adapter-v1.mjs',entry:'captureImportPreconfig',readonly:true}),
});
export async function loadPrivateCaptureResource(root,manifest,harness) {
 const descriptor=Object.hasOwn(registrations,harness)?registrations[harness]:undefined;
 if(!descriptor||!isAbsolute(root))throw Error('LOGINOM_CAPTURE_UNAVAILABLE');
 const entries=manifest.files.filter(file=>file.path===descriptor.path);
 const file=join(root,descriptor.path);
 if(entries.length!==1||entries[0].link||entries[0].directory||!/^[a-f0-9]{64}$/.test(entries[0].sha256))throw Error('LOGINOM_CAPTURE_UNAVAILABLE');
 const files=manifest.files,item=entries[0],sha256=item.sha256,canonical=await realpath(root);
 const assertManifest=()=>{
  const current=manifest.files.filter(f=>f.path===descriptor.path);
  if(manifest.files!==files||current.length!==1||current[0]!==item||item.sha256!==sha256||item.link||item.directory)throw Error('LOGINOM_CAPTURE_UNAVAILABLE');
 };
 const verify=async()=>{
  assertManifest();
  if(await realpath(root)!==canonical||await realpath(file)!==join(canonical,descriptor.path))throw Error('LOGINOM_CAPTURE_UNAVAILABLE');
  assertManifest();
  const bytes=await readFile(file);assertManifest();
  if(createHash('sha256').update(bytes).digest('hex')!==sha256)throw Error('LOGINOM_CAPTURE_UNAVAILABLE');
 };
 await verify();
 const module=await import(pathToFileURL(file).href);
 await verify();
 if(typeof module[descriptor.entry]!=='function'||(descriptor.readonly&&(
  module.captureMode!=='readonly'||typeof module.validateCaptureResult!=='function'
  ||Object.keys(module).filter(k=>k.startsWith('capture')&&k!=='captureMode').join(',')!==descriptor.entry)))
  throw Error('LOGINOM_CAPTURE_UNAVAILABLE');
 const resource=Object.freeze({path:descriptor.path,sha256});
 let registration;
 if(module.captureMode!==undefined){
  if(module.captureMode!=='readonly'||typeof module.validateCaptureResult!=='function')throw Error('LOGINOM_CAPTURE_UNAVAILABLE');
  registration=Object.freeze({mode:'readonly',validate:module.validateCaptureResult,resource});
 }
 return Object.freeze({harness:module[descriptor.entry],resource,registration});
}
