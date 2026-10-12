// Exact fixed registration block; labelled module/FS fixture, no lifecycle.
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {readFile,writeFile,mkdir,mkdtemp,rm,realpath,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
const source=await readFile(process.env.PATH_MANAGED_ENTRY??new URL('../src/managed-entry.mjs',import.meta.url),'utf8');
const begin=source.indexOf('      let captureHarness'),end=source.indexOf('      // A new process',begin);assert.ok(begin>=0&&end>begin);
const block=source.slice(begin,end),fixed='runtime/src/acceptance/calculator-grouped-before-done-v1.mjs';
for(const scenario of ['canonical','wrong-path','wrong-hash','duplicate','wrong-export','symlink','missing'])test('exact loader fixed resource '+scenario,async()=>{
 const root=await mkdtemp(join(tmpdir(),'fixed-loader-'));
 try{
  const path=scenario==='wrong-path'?fixed.replace('/src/','/'):fixed,code=scenario==='wrong-export'?'export const wrong=()=>{};':'export const captureCalculator=()=>({fixture:true});';
  await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),code);
  if(scenario==='symlink'){await rm(join(root,path));await writeFile(join(root,'foreign.mjs'),code);await symlink(join(root,'foreign.mjs'),join(root,path))}
  const item={path,sha256:scenario==='wrong-hash'?'0'.repeat(64):createHash('sha256').update(code).digest('hex')};
  const files=scenario==='missing'?[]:scenario==='duplicate'?[item,{...item}]:[item];
  const ctx=vm.createContext({acceptanceCapture:{fixture:true},resources:{manifest:{files}},input:{resources:root},Error,join,pathToFileURL,realpath,readFile,createHash});
  const script=new vm.Script('(async()=>{'+block+';return captureHarness})()', {importModuleDynamically:vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER});
  if(scenario==='canonical'){const fn=await script.runInContext(ctx);assert.equal(typeof fn,'function');assert.deepEqual(await fn(),{fixture:true})}
  else await assert.rejects(script.runInContext(ctx),/LOGINOM_CAPTURE_UNAVAILABLE/);
 }finally{await rm(root,{recursive:true,force:true})}
});
