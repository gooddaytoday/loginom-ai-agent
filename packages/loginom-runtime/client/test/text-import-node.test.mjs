import test from 'node:test';
import assert from 'node:assert/strict';
import {createTextImportNodeSupport,validateTextImportNodeParameters,verifyTextImportSource} from '../lib/text-import-node.mjs';
const params=()=>({settings:{source:{source_path:'/test/data.csv',encoding:'UTF-8',rows_to_skip:0,first_line_as_title:true},format:{delimiter:';',decimal_separator:'.',null_marker:'NULL',text_qualifier:'"'},columns:[{name:'A',label:'A',type:'integer',data_kind:'Дискретный',used:true}]},source:{artifact_id:'artifact',upload_operation_id:'upload',bytes:15,sha256:'a'.repeat(64)}});
const request=()=>({finish:'done',read:{ports:[]},mappings:[],inputs:[]});
const uploaded=()=>({operation_id:'upload',artifact:{artifact_id:'artifact',bytes:15,sha256:'a'.repeat(64)},outcome:{operation_id:'upload',action_key:'artifact.upload',status:'SUCCEEDED',cleanup_complete:true,output:{artifact_id:'artifact',destination:'/test/data.csv',bytes:15,sha256:'a'.repeat(64),server_copy_verification:{verification_id:'verification',status:'SUCCEEDED',bytes_verified:true,upload_completion_verified:true,destination:'/test/data.csv',bytes:15,sha256:'a'.repeat(64)}}}});
test('Done candidate validates complete request before opening the node',()=>{
 validateTextImportNodeParameters(params(),'delimited',request());
 for(const mutate of [r=>r.finish='unknown',r=>r.read.ports=[0],r=>r.mappings=[{direction:'output'}],r=>r.inputs=[{}]]){const r=request();mutate(r);assert.throws(()=>validateTextImportNodeParameters(params(),'delimited',r));}
 for(const mutate of [p=>p.settings.columns[0].used=false,p=>p.source.sha256='wrong',p=>p.source.extra=true]){const p=params();mutate(p);assert.throws(()=>validateTextImportNodeParameters(p,'delimited',request()));}
});
test('source requires the completed upload byte verification chain, not a matching path',()=>{
 const verified=verifyTextImportSource(params(),[uploaded()]);assert.equal(verified.source.verification_id,'verification');assert.equal(verified.effect_possible,false);
 assert.throws(()=>verifyTextImportSource(params(),[]));assert.throws(()=>verifyTextImportSource(params(),[uploaded(),uploaded()]));
});
test('omitted source settings still require an explicit verified storage destination',()=>{
 const p=params();p.settings={columns:[{name:'A',label:'Updated'}]};
 assert.equal(verifyTextImportSource(p,[uploaded()]).source.destination,'/test/data.csv');
 for(const destination of [undefined,'','relative.csv','/test/../data.csv']) {
  const u=uploaded();u.outcome.output.destination=destination;
  u.outcome.output.server_copy_verification.destination=destination;
  assert.throws(()=>verifyTextImportSource(p,[u]));
 }
});
for(const [name,change] of Object.entries({
 unknown:u=>u.outcome.status='AMBIGUOUS',cleanup:u=>u.outcome.cleanup_complete=false,
 artifact:u=>u.artifact.artifact_id='other',upload:u=>u.outcome.operation_id='other',path:u=>u.outcome.output.server_copy_verification.destination='/test/other.csv',
 bytes:u=>u.outcome.output.server_copy_verification.bytes=16,sha:u=>u.outcome.output.server_copy_verification.sha256='b'.repeat(64),
 submitted_only:u=>delete u.outcome.output.server_copy_verification,unverified:u=>u.outcome.output.server_copy_verification.bytes_verified=false,
 incomplete:u=>u.outcome.output.server_copy_verification.upload_completion_verified=false,
}))test('source refuses '+name,()=>{const u=uploaded();change(u);assert.throws(()=>verifyTextImportSource(params(),[u]));});
test('source reference resolves integrity metadata without mutating the request',()=>{
 const p=params();delete p.source.bytes;delete p.source.sha256;
 const before=structuredClone(p);
 validateTextImportNodeParameters(p,'delimited',request());
 const result=verifyTextImportSource(p,[uploaded()]);
 assert.equal(result.source.bytes,15);assert.equal(result.source.sha256,'a'.repeat(64));
 assert.deepEqual(p,before);
 for(const [key,value] of [['bytes',16],['sha256','b'.repeat(64)]]) {
  const mismatch=structuredClone(p);mismatch.source[key]=value;
  assert.throws(()=>verifyTextImportSource(mismatch,[uploaded()]), /do not match/);
 }
});
test('reference cannot bypass missing, duplicate or corrupted upload evidence',()=>{
 const p=params();delete p.source.bytes;delete p.source.sha256;
 for(const uploads of [[],[uploaded(),uploaded()]])assert.throws(()=>verifyTextImportSource(p,uploads));
 for(const mutate of [
  u=>u.artifact.artifact_id='foreign',u=>u.outcome.status='AMBIGUOUS',
  u=>u.outcome.cleanup_complete=false,u=>delete u.outcome.output.server_copy_verification,
  u=>u.outcome.output.server_copy_verification.bytes_verified=false,
  u=>u.outcome.output.server_copy_verification.upload_completion_verified=false,
  u=>u.outcome.output.server_copy_verification.sha256='b'.repeat(64),
  u=>u.outcome.output.bytes=16,u=>delete u.artifact.sha256,
  u=>{for(const a of [u.artifact,u.outcome.output,u.outcome.output.server_copy_verification])a.sha256='invalid'},
 ]){const u=uploaded();mutate(u);assert.throws(()=>verifyTextImportSource(p,[u]));}
});
test('handler receives only its operation-local trusted drivers',async()=>{
 const support=createTextImportNodeSupport({targetOrigin:'https://example.test',targetBuild:'7.4.2'});
 const h=support.nodeApplyHandlers.get('imports.text'),calls=[];
 const result=await h.configure({operation_id:'owned'},params(),{configureTextImport:async(c,p)=>{calls.push([c,p]);return{verified:true};}});
 assert.equal(result.verified,true);assert.equal(calls[0][0].operation_id,'owned');
});

test('Done candidate admits an explicitly requested wide schema for paged verification',()=>{
 const p=params();p.settings.columns=Array.from({length:66},(_,i)=>({...p.settings.columns[0],name:'Field'+i,label:'Field'+i}));validateTextImportNodeParameters(p,'delimited',request());
});

test('Done candidate admits explicit rename, independent labels and partial field exclusion',()=>{
 const p=params();p.settings.columns=[{...p.settings.columns[0],source_name:'Original',name:'Renamed',label:'Метка'},
  {...p.settings.columns[0],name:'Omitted',used:false}];
 validateTextImportNodeParameters(p,'delimited',request());
 for(const change of [p=>p.settings.columns[0].source_name='',p=>p.settings.columns[0].name='bad name',
  p=>p.settings.columns[1].source_name='Original']) {const bad=structuredClone(p);change(bad);assert.throws(()=>validateTextImportNodeParameters(bad,'delimited',request()));}
});

test('private Execute admits its one data output and rejects other ports',()=>{
 const r=request();r.finish='execute';validateTextImportNodeParameters(params(),'delimited',r);r.read.ports=[0];validateTextImportNodeParameters(params(),'delimited',r);r.read.ports=[1];assert.throws(()=>validateTextImportNodeParameters(params(),'delimited',r));
});

test('identity output binds by name while retaining the observed output order',async()=>{
 const {bindIdentityOutputColumns}=await import('../lib/text-import-node.mjs');
 const columns=[{name:'Title',label:'Title',type:'string',data_kind:'Дискретный',used:true},
  {name:'Id',label:'Identifier',type:'integer',data_kind:'Дискретный',used:true}];
 const actual={total_columns:2,fields:[columns[1],columns[0]].map((c,index)=>({...c,index,status:'observed',source:{status:'rendered_source',label:c.label,type:c.type}}))};
 assert.deepEqual(bindIdentityOutputColumns(columns,actual),[columns[1],columns[0]]);
 for(const change of ['duplicate','foreign_source','wrong_type','wrong_index']) {
  const bad=structuredClone(actual);
  if(change==='duplicate')bad.fields[1]=structuredClone(bad.fields[0]);
  if(change==='foreign_source')bad.fields[0].source.label='Other';
  if(change==='wrong_type')bad.fields[0].type='real';
  if(change==='wrong_index')bad.fields[0].index=1;
  assert.throws(()=>bindIdentityOutputColumns(columns,bad),change);
 }
});

test('private import admits configured output edits and rejects unsupported exclusion before UI',()=>{
 const r=request();r.mappings=[{direction:'output',port:0,autosync:false,fields:[{source:{kind:'configured_field',name:'A'},name:'Mapped'}]}];
 validateTextImportNodeParameters(params(),'delimited',r);
 for(const change of [m=>m.fields[0].excluded=true,m=>m.fields[0].source={schema_id:'s',field_id:'f'},m=>m.port=1,m=>m.direction='input',m=>m.fields=[]]) {
  const bad=structuredClone(r);change(bad.mappings[0]);assert.throws(()=>validateTextImportNodeParameters(params(),'delimited',bad));
 }
});
test('native output binding preserves aliases, source identities and output order',async()=>{
 const {bindConfiguredOutputColumns:bind}=await import('../lib/text-import-node.mjs');
 const configured=['A','B'].map(name=>({name,label:'Same',type:'string',data_kind:'Дискретный',used:true}));
 const sources=configured.map((f,i)=>({record_id:'s'+i,field_id:String(i),name:f.name,label:f.label,type:f.type,index:i,required:true}));
 const native={verified:true,source_identity_verified:true,inventory_complete:true,source_fields:sources,
  target_fields:[sources[1],sources[0]].map((source,index)=>({record_id:'t'+index,index,name:'Alias'+index,label:'Label'+index,type:'string',data_kind:'Дискретный',source}))};
 const actual={total_columns:2,fields:native.target_fields.map(f=>({...f,status:'observed',source:{status:'rendered_source',label:f.source.label,type:f.source.type}}))};
 assert.deepEqual(bind(configured,actual,native).map(f=>f.name),['Alias0','Alias1']);
 for(const change of [n=>n.target_fields[0].source={...n.target_fields[0].source,record_id:'foreign'},n=>n.target_fields[1].source=n.target_fields[0].source,n=>n.source_fields[0].name='Other',n=>n.inventory_complete=false]) {
  const bad=structuredClone(native);change(bad);assert.throws(()=>bind(configured,actual,bad));
 }
 const bad=structuredClone(actual);bad.fields.reverse();assert.throws(()=>bind(configured,bad,native));
});
