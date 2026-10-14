import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {fixture,unionCleanupWitness} from './reviewer-kind-fixture.mjs';
const lib=process.env.UNION_PRODUCER_LIB || new URL('../lib/',import.meta.url).pathname;
const {nodeApplyInputSchema}=await import(pathToFileURL(join(lib,'node-api.mjs')));
const {createUnionNodeSupport}=await import(pathToFileURL(join(lib,'union-node.mjs')));
const kinds=nodeApplyInputSchema.properties.target.properties.type.enum;
const handlers=createUnionNodeSupport({targetOrigin:'http://fixture.invalid',targetBuild:'7.4.2'}).nodeApplyHandlers;
assert(kinds.includes('transform.union_data'));
assert(!kinds.includes('transform.union'));
assert(handlers.has('transform.union_data'));
assert(!handlers.has('transform.union'));
const results=[];
for(const kind of ['transform.union','transform.union_data']) {
 test('selected receipt component matches original stock Union discriminator: '+kind,async()=>{
  let f,accepted=false,error,proof;
  try {
   try {f=await fixture(kind);proof=await f.scope.complete();accepted=unionCleanupWitness(proof,f.operation);}
   catch(e){error=e;}
   results.push({kind,schemaAccepted:kinds.includes(kind),handlerRegistered:handlers.has(kind),
     componentAccepted:accepted,error:error?.message,counts:f?{...f.counts}:{close:0,read:0,write:0},native:false});
   // Apply the stock original-request contract to both sides of the seam.
   // A canonical original request qualifies; an unsupported alias does not.
   assert.equal(accepted,kinds.includes(kind));
  }finally{
   if(f)await f.cleanup();
   await writeFile(process.env.UNION_KIND_RESULTS || new URL('./kind-results.json',import.meta.url),JSON.stringify(results,null,2)+'\n');
  }
 });
}
