import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRuntimeSourcePin} from '../lib/runtime-pin.mjs';
test('runtime pin changes for new, modified and nested executable modules without list edits',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dock-pin-'));
 try {
  await mkdir(join(dir,'lib'));const base=pathToFileURL(join(dir,'lib/session.mjs'));
  await writeFile(join(dir,'lib/session.mjs'),'session');await writeFile(join(dir,'package.json'),'{}');
  const first=await createRuntimeSourcePin(base,['../package.json','./session.mjs']);
  assert.equal(first.manifest.length,2);assert.deepEqual(await createRuntimeSourcePin(base,['./session.mjs','../package.json']),first);
  await writeFile(join(dir,'lib/delivery.mjs'),'new');const second=await createRuntimeSourcePin(base,['../package.json']);assert.notEqual(second.revision,first.revision);
  await writeFile(join(dir,'lib/delivery.mjs'),'changed');assert.notEqual((await createRuntimeSourcePin(base,['../package.json'])).revision,second.revision);
  await mkdir(join(dir,'lib/nested'));await writeFile(join(dir,'lib/nested/handler.mjs'),'nested');
  assert.ok((await createRuntimeSourcePin(base)).manifest.some(e=>e.path==='./nested/handler.mjs'));
  await symlink(join(dir,'package.json'),join(dir,'lib/linked.mjs'));await assert.rejects(()=>createRuntimeSourcePin(base),/symlinks/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
