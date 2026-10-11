import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const root=process.env.REFORM_RUNTIME??new URL('..',import.meta.url).pathname;
const {resolveReformChanges}=await import(pathToFileURL(root+'/lib/reform-parameters.mjs'));
const {reformOutputSources}=await import(pathToFileURL(root+'/lib/reform-output.mjs'));
const fixtures=new URL('../../../../docs/node-development/nodes/field-parameters/acceptance/fixtures/preservation/',import.meta.url);
const read=async name=>JSON.parse(await readFile(new URL(name,fixtures),'utf8'));
const manifest=await read('manifest.json');
for(const name of ['rowid-ab-c','wide-130','empty-typed']){
 test(name+': independently pinned bytes and schema/cardinality contract',async()=>{
  const c=await read(name+'.json');
  for(const ext of ['csv','json']){
   const pin=manifest.files.filter(f=>f.path===name+'.'+ext);assert.equal(pin.length,1);
   const bytes=await readFile(new URL(name+'.'+ext,fixtures));
   assert.equal(bytes.length,pin[0].bytes);
   assert.equal(createHash('sha256').update(bytes).digest('hex'),pin[0].sha256);
  }
  assert.equal(c.expected.cardinality,c.expected.rows.length);
  assert.equal(c.expected.rows.length,c.input_rows.length);
  assert.ok(c.expected.rows.every(r=>r.length===c.expected.columns.length));
  assert.deepEqual(c.expected.columns.map(f=>f.name),c.expected_configuration.filter(f=>!f.excluded).map(f=>f.name));
 });
 test(name+': actual reform metadata projection matches literal expectation',async()=>{
  // Synthetic owned context and field IDs: not native identity evidence.
  const c=await read(name+'.json');
  const fields=c.input_columns.map((f,i)=>({...f,record_id:'fixture:'+i,field_id:'fixture-field:'+i}));
  const baseline={verified:true,inventory_complete:true,fields};
  const before=structuredClone(baseline);
  const r=resolveReformChanges({changes:c.changes},baseline);
  const expected=c.expected_configuration.map((f,i)=>({...f,record_id:'fixture:'+i,field_id:'fixture-field:'+i}));
  assert.deepEqual(r.fields,expected);assert.deepEqual(baseline,before);
  const owner={verified:true,document_id:'offline-document',workflow_id:'offline-workflow',node_id:'offline-node'};
  const output=reformOutputSources({...baseline,source_identity_verified:true,node_context:owner,fields:r.fields},
   {verified:true,inventory_complete:true,source_identity_verified:true,node_context:owner,source_fields:c.expected.columns});
  assert.deepEqual(output.map(({name,label,type})=>({name,label,type})),c.expected.columns);
  assert.deepEqual(output.map(f=>f.field_id),expected.filter(f=>!f.excluded).map(f=>f.field_id));
 });
}
