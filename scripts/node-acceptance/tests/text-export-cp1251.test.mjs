import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('independent byte oracle rejects UTF-8 as CP1251, BOM, LF and a single changed Cyrillic byte',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'cp1251-oracle-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const oracle=new URL('../../../docs/node-development/nodes/text-export/acceptance/cp1251/oracle.py',import.meta.url);
 const fixture=new URL('../../../packages/loginom-runtime/tools/loginom-acceptance/fixtures/text-export/expected/',import.meta.url);
 const cp=await readFile(new URL('cp1251.bin',fixture)),utf=await readFile(new URL('cp1251-utf8.bin',fixture));
 const check=async(bytes,encoding)=>{
  const path=join(dir,'actual.csv');await writeFile(path,bytes);
  return spawnSync('python3',['-B',oracle.pathname,'--csv',path,'--encoding',encoding],{encoding:'utf8'});
 };
 for(const [bytes,encoding] of [[cp,'cp1251'],[utf,'utf-8']]){
  const r=await check(bytes,encoding);assert.equal(r.status,0,r.stdout+r.stderr);
 }
 const changed=Buffer.from(cp);changed[0]^=1;
 for(const bytes of [utf,Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),cp]),Buffer.from(cp.filter(b=>b!==13)),changed,cp.subarray(0,-1)]){
  const r=await check(bytes,'cp1251');assert.equal(r.status,1,r.stdout+r.stderr);
 }
});
