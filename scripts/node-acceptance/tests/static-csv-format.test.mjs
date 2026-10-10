import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {normalizeStaticCsvFormat,verifyStaticSourceFixture,observeStaticSources,verifyStaticSourceBytes} from '../static-source-proof.mjs';

const format=(delimiter,null_marker)=>({delimiter,decimal_separator:'.',text_qualifier:'"',null_marker});
const fixture=(bytes,parser)=>({bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),format:parser});
for(const [delimiter,nullMarker] of [[',','?'],[';','NULL'],[';','\\N'],[',','\\N']]){
 test(`independent byte binding accepts pinned ${delimiter}/${nullMarker}`,()=>{
  const bytes=Buffer.from(`Id${delimiter}Value\n1${delimiter}${nullMarker}\n`);
  const observed=normalizeStaticCsvFormat({delimiter:delimiter===','?'Запятая':'Точка с запятой',decimal_separator:'Точка (.)',text_qualifier:'Двойная кавычка (")',null_marker:nullMarker});
  const expected=fixture(bytes,format(delimiter,nullMarker));
  assert.equal(verifyStaticSourceFixture({bytes,allowed:[expected],format:observed}).fixture,expected);
  for(const bad of [{...observed,delimiter:delimiter===','?';':','},{...observed,null_marker:'WRONG'},
   {...observed,decimal_separator:','},{...observed,text_qualifier:"'"}])
   assert.throws(()=>verifyStaticSourceFixture({bytes,allowed:[expected],format:bad}),/CSV parser differs/);
 });
}
test('unknown and partial native format cannot become a pin',()=>{
 for(const bad of [{...format(';','NULL'),delimiter:'Разделитель'}, {...format(';','NULL'),decimal_separator:'Запятая'},
  {...format(';','NULL'),null_marker:undefined},{...format(';','NULL'),text_qualifier:'Нет'}])
  assert.throws(()=>normalizeStaticCsvFormat(bad),/unknown or unsupported/);
});
test('bytes, size, unique identity and complete canonical specification are mandatory',()=>{
 const bytes=Buffer.from('Id;Value\n1;NULL\n'),f=fixture(bytes,format(';','NULL'));
 for(const allowed of [[],[f,f],[{...f,bytes:f.bytes+1}],[{...f,sha256:'0'.repeat(64)}],
  [{...f,format:undefined}],[{...f,format:{delimiter:';',null_marker:'NULL'}}],
  [{...f,format:{...f.format,delimiter:'Точка с запятой'}}]])
  assert.throws(()=>verifyStaticSourceFixture({bytes,allowed,format:f.format}));
 assert.throws(()=>verifyStaticSourceFixture({bytes:Buffer.from('Id;Value\n2;NULL\n'),allowed:[f],format:f.format}),/fixture mismatch/);
});

export async function observeCsvSubject(observe=observeStaticSources,verifiedSources){
 const ref={node_id:'source-guid'},path='/owner/input.csv';
 const fields=Object.fromEntries(Object.entries({connection:'Локальное',source_path:path,rows_to_skip:'0',first_line_as_title:true,encoding:'UTF-8 (65001)'}).map(([k,value])=>[k,{value}]));
 const observed={delimiter:'Точка с запятой',decimal_separator:'Точка (.)',null_marker:'NULL',text_qualifier:'Двойная кавычка (")'};
 const native={verified:true,inventory_complete:true,autosync:true,source_fields:[{record_id:'id'}],target_fields:[{name:'Id',label:'Id',type:'integer',source:{record_id:'id',name:'Id'}}]};
 let cancels=0;
 const channel={perform:async()=>{},openOutputPort:async()=>{},observe:async ({condition})=>condition.includes('mapping')?{node_mapping:native}:condition.includes('CSV format')?
  {wizard:{stage:'text_import_format',settings:{fields:Object.fromEntries(Object.entries(observed).map(([k,value])=>[k,{value,status:'observed',truncated:false}]))}}}:
  {wizard:{root_tid:'wizard',import_source:{fields}},ui:{elements:[{tid:'wizard;btnNext',allowed_actions:['wizard_step'],ref:{}}]}}};
 const load=async name=>({openPreparedWizard:async()=>{},closePreparedWizard:async()=>{cancels++;return {verified:true,settings_applied:false};},isTextImportSourceReady:()=>true,showMissingValuesMappingTable:async()=>{},selectPreparedGraphNode:async()=>{}});
 const sources=await observe({load,graph:{nodes:[{type:'imports.text',ref}]},channelFor:()=>channel,account:'owner',verifiedSources});
 return {sources,cancels};
}
test('actual readonly source route observes semicolon without applying settings and rechecks downloaded pin',async()=>{
 const first=await observeCsvSubject();
 assert.equal(first.cancels,2);
 assert.deepEqual(first.sources.imports[0].configuration.format,format(';','NULL'));
 const proof={bytes_verified:true,download_completion_verified:true,provenance:'independent_server_file_download',fixture:{format:format(';','NULL')}};
 assert.equal((await observeCsvSubject(observeStaticSources,new Map([['/owner/input.csv',proof]]))).cancels,2);
 await assert.rejects(observeCsvSubject(observeStaticSources,new Map()),/provenance missing/);
 await assert.rejects(observeCsvSubject(observeStaticSources,new Map([['/owner/input.csv',{...proof,fixture:{format:format(',','?')}}]])),/CSV parser differs/);
});
test('native download route binds actual bytes before accepting CSV settings and preserves schema guards',async()=>{
 const output=await mkdtemp(join(tmpdir(),'csv-proof-'));
 try{
  const bytes=Buffer.from('Id;Value\n1;NULL\n'),columns=[{name:'Id',label:'Id',type:'integer'}];
  const expected={...fixture(bytes,format(';','NULL')),columns};
  const snapshot={observation_id:'obs',dom_epoch:{document:'doc'},workflow_ref:{prefix:'MF'},
   file_storage:{status:'observed',directory:'/owner'},ui:{elements:[
    {tid:'MF;FileStorageForm;root'}, {tid:'MF;NavigationBar;NavigationPanel'},
    {label:'input.csv',ref:{},storage_entry:{kind:'file',bytes_source:'native_file_store',bytes:bytes.length}}]}};
  const runtime={observe:async()=>({status:'SUCCEEDED',output:snapshot})};
  const load=async()=>({findNativeStorageRow:async()=>snapshot,makeArtifactDownloadCode:options=>options});
  const sources=()=>({imports:[{configuration:{source:{source_path:'/owner/input.csv'},format:format(';','NULL'),output_mapping:{fields:columns}}}]});
  const execute=async options=>{await writeFile(options.download_path,bytes);return {status:'SUCCEEDED',cleanup_complete:true,output:{download_completed:true}};};
  const read=(allowed,source=sources())=>verifyStaticSourceBytes({load,runtime,execute,sources:source,allowed,account:'owner',origin:'https://example.test',output});
  const verified=await read([expected]);
  assert.equal(verified.get('/owner/input.csv').provenance,'independent_server_file_download');
  assert.equal(verified.get('/owner/input.csv').bytes_verified,true);
  await assert.rejects(read([{...expected,format:format(',','?')}]),/CSV parser differs/);
  await assert.rejects(read([{...expected,sha256:'0'.repeat(64)}]),/fixture mismatch/);
  await assert.rejects(read([expected,expected]),/fixture mismatch/);
  await assert.rejects(read([{...expected,columns:[{...columns[0],type:'string'}]}]),/schema differs/);
  await assert.rejects(read([{...expected,bytes:1}]),/size differs before download/);
 }finally{await rm(output,{recursive:true,force:true});}
});
