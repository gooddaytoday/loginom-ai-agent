import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const product=process.env.CALCULATOR_PRODUCT;
test('unaltered clean receiving product inventories the actual fixed harness and refuses unbound capture',
 {skip:!product,timeout:30000},async()=>{
 const root=join(product,'resources/loginom'),path='runtime/src/acceptance/calculator-grouped-before-done-v1.mjs';
 const manifest=JSON.parse(await readFile(join(root,'resource-manifest.json')));
 const items=manifest.files.filter(f=>f.path===path);assert.equal(items.length,1);
 const bytes=await readFile(join(root,path));assert.equal(createHash('sha256').update(bytes).digest('hex'),items[0].sha256);
 const source=await readFile(new URL('../src/acceptance/calculator-grouped-before-done-v1.mjs',import.meta.url));
 assert.deepEqual(bytes,source); // No successful fixture substituted in the inventory.
 const metadata=JSON.parse(await readFile(join(product,'cli-manifest.json')));
 assert.equal(metadata.sourceDirty,false);
 const node=join(root,'bin/node');
 const verified=await promisify(execFile)(node,['--input-type=module','-e',
  `import {verifyResources} from ${JSON.stringify(pathToFileURL(join(root,'runtime/src/resources.mjs')).href)};await verifyResources(${JSON.stringify(root)});console.log('verified');`]);
 assert.equal(verified.stdout.trim(),'verified');
 const {launchCalculatorDiagnostic}=await import(pathToFileURL(process.env.CALCULATOR_LAUNCHER));
 const profile=await mkdtemp(join(tmpdir(),'lab66-no-native-product-'));let host;
 try{
  host=await launchCalculatorDiagnostic({node,entry:join(root,'host/node-host.mjs'),resources:root,root:profile,headless:true,environment:{},packagePath:'/account/draft.lgp'});
  // Empty profile has no connection/account: no login, Page or native admission.
  await assert.rejects(host.capture('foreign-unacquired-run'));
  await host.close();host=undefined;
 }finally{await host?.close();await rm(profile,{recursive:true,force:true});}
});
