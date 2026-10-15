import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyGeneratedCollapseMapping,observeStaticSources,verifyStaticSourceBytes} from '../static-source-proof.mjs';
test('generated Collapse definition requires complete native canonical schema without mapping or exclusion',()=>{
 const schema=[{name:'Key',label:'Key',type:'string'},{name:'Values',label:'Значения',type:'variant'}];
 const mapping={verified:true,inventory_complete:true,source_fields:[],target_fields:schema.map(f=>({...f,source:null,inherited:false,excluded:false}))};
 assert.equal(verifyGeneratedCollapseMapping(mapping,schema),true);
 for(const mutate of [m=>m.verified=false,m=>m.inventory_complete=false,m=>m.source_fields.push({record_id:'other'}),
  m=>m.target_fields.pop(),m=>m.target_fields.reverse(),m=>m.target_fields[1].name='Other',
  m=>m.target_fields[1].label='Other',m=>m.target_fields[1].type='string',m=>m.target_fields[1].excluded=true,
  m=>m.target_fields[1].inherited=true,m=>m.target_fields[1].source={record_id:'other'}]){
  const bad=structuredClone(mapping);mutate(bad);assert.throws(()=>verifyGeneratedCollapseMapping(bad,schema));
 }
});

// The existing readonly cold procedure must accept the Join task's semicolon/NULL parser.
test('cold source observes semicolon NULL without configuring or executing',async()=>{
 const ref={node_id:'source-guid'},path='/owner/input.csv';let cancels=0;
 const fields=Object.fromEntries(Object.entries({connection:'Локальное',source_path:path,rows_to_skip:'0',first_line_as_title:true,encoding:'UTF-8 (65001)'}).map(([k,value])=>[k,{value}]));
 const observed={delimiter:'Точка с запятой',decimal_separator:'Точка (.)',null_marker:'NULL',text_qualifier:'Двойная кавычка (")'};
 const native={verified:true,inventory_complete:true,autosync:true,source_fields:[{record_id:'id'}],target_fields:[{name:'Id',label:'Id',type:'integer',source:{record_id:'id',name:'Id'}}]};
 const channel={async openOutputPort(){},async perform(){},async observe({condition}){return condition.includes('mapping')?{node_mapping:native}:condition.includes('CSV format')?
  {wizard:{stage:'text_import_format',settings:{fields:Object.fromEntries(Object.entries(observed).map(([k,value])=>[k,{value,status:'observed',truncated:false}]))}}}:
  {wizard:{root_tid:'wizard',import_source:{fields}},ui:{elements:[{tid:'wizard;btnNext',allowed_actions:['wizard_step'],ref:{}}]}}}};
 const load=async()=>({openPreparedWizard:async()=>{},closePreparedWizard:async()=>{cancels++;return {verified:true,settings_applied:false}},isTextImportSourceReady:()=>true,showMissingValuesMappingTable:async()=>{},selectPreparedGraphNode:async()=>{}});
 const result=await observeStaticSources({load,graph:{nodes:[{type:'imports.text',ref}]},channelFor:()=>channel,account:'owner'});
 assert.deepEqual(result.imports[0].configuration.format,{delimiter:';',decimal_separator:'.',null_marker:'NULL',text_qualifier:'"'});
 assert.equal(cancels,2);
});

test('cold source rejects parser drift against the existing downloaded fixture',async()=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{createHash}=await import('node:crypto');
 const output=await mkdtemp(join(tmpdir(),'join-cold-parser-'));
 try {
  const bytes=Buffer.from('Id;Value\n1;NULL\n'),columns=[{name:'Id',label:'Id',type:'integer'}],format={delimiter:';',decimal_separator:'.',null_marker:'NULL',text_qualifier:'"'};
  const expected={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),columns,format};
  const snapshot={observation_id:'obs',dom_epoch:{document:'doc'},workflow_ref:{prefix:'MF'},file_storage:{status:'observed',directory:'/owner'},ui:{elements:[{tid:'MF;FileStorageForm;root'},{tid:'MF;NavigationBar;NavigationPanel'},{label:'input.csv',ref:{},storage_entry:{kind:'file',bytes_source:'native_file_store',bytes:bytes.length}}]}};
  const runtime={observe:async()=>({status:'SUCCEEDED',output:snapshot})},load=async()=>({findNativeStorageRow:async()=>snapshot,makeArtifactDownloadCode:options=>options});
  const sources=()=>({imports:[{configuration:{source:{source_path:'/owner/input.csv'},format,output_mapping:{fields:columns}}}]});
  const execute=async options=>{await writeFile(options.download_path,bytes);return {status:'SUCCEEDED',cleanup_complete:true,output:{download_completed:true}}};
  const run=fixture=>verifyStaticSourceBytes({load,runtime,execute,sources:sources(),allowed:[fixture],account:'owner',origin:'https://fixture.invalid',output});
  assert.equal((await run(expected)).size,1);
  await assert.rejects(run({...expected,format:{...format,delimiter:','}}),/CSV parser differs/);
  await assert.rejects(run({...expected,format:{...format,null_marker:'?'}}),/CSV parser differs/);
 } finally {await rm(output,{recursive:true,force:true})}
});
