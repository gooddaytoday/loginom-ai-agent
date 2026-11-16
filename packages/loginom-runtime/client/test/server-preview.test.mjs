import test from 'node:test';
import assert from 'node:assert/strict';
import {serverPreviewProfile,validateTextImportNodeParameters} from '../lib/text-import-node.mjs';
import {compactNodeResult} from '../lib/user-results.mjs';
import {textImportStepBudget} from '../lib/text-import-limits.mjs';
const fields=values=>({fields:Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{status:'observed',value}]))});
test('server preview without declared columns uses the existing bounded schema-read allowance',()=>{
 const parameters={source:{kind:'storage',server_source_ref:'storage-one'},preview_only:true,
  settings:{source:{source_path:'/worker/full.csv'}}};
 const request={target:{kind:'new'},parameters,finish:'close',inputs:[],mappings:[],read:{ports:[]}};
 validateTextImportNodeParameters(parameters,'delimited',request);
 assert.equal(textImportStepBudget(request),textImportStepBudget({...request,target:{kind:'existing'}}));
});
test('server preview has no digest, exact N or rare-type claim and survives the user reply projection',()=>{
 const profile=serverPreviewProfile({source:fields({encoding:'Windows 1251',source_path:'/worker/full.csv'}),
  format:fields({delimiter:'Точка с запятой',decimal_separator:','}),
  columns:[{index:0,name:'Amount',label:'Сумма',type:'real',data_kind:'Непрерывный',used:true}],
  preview:{rows:Array.from({length:25},(_,i)=>[String(i)]),requested_records:25,rendered_only:true}});
 assert.equal(profile.coverage,'preview');assert.equal(profile.preview.observed_records,25);
 assert.equal(profile.sha256,undefined);assert.equal(profile.records,undefined);assert.equal(profile.record_estimate,undefined);
 assert.ok(profile.limitations.includes('rare_types_not_validated'));
 const reply=compactNodeResult({operation_id:'preview',state:'settled',attempt:1,outcome:{status:'SUCCEEDED',
  output:{output:{status:'partial',ports:[],server_profile:profile},cleanup_complete:true}}});
 assert.equal(reply.output.server_profile.coverage,'preview');
 assert.ok(Buffer.byteLength(JSON.stringify({content:[{type:'text',text:JSON.stringify(reply)}],structuredContent:reply}),'utf8')<=8192);
});
test('wide/long preview is explicitly incomplete and stays bounded',()=>{
 const profile=serverPreviewProfile({source:fields({encoding:'UTF-8'}),format:fields({delimiter:';'}),
  columns:Array.from({length:1000},(_,index)=>({index,name:'Column'+index,label:'Я'.repeat(120),type:'string'})),
  preview:{rows:Array.from({length:25},()=>Array.from({length:1000},()=>'Я'.repeat(256))),requested_records:25,rendered_only:true}});
 assert.ok(profile.columns_omitted>0);assert.equal(profile.preview.complete,false);
 assert.ok(Buffer.byteLength(JSON.stringify(profile),'utf8')<2400);
});
test('server preview refuses execution, output reads, mappings, caller counts, lists and storage without its path',()=>{
 const p={source:{kind:'storage',server_source_ref:'storage-one'},settings:{source:{source_path:'/worker/full.csv'}},preview_only:true};
 const r={target:{kind:'new'},finish:'close',inputs:[],mappings:[],read:{ports:[]}};
 assert.doesNotThrow(()=>validateTextImportNodeParameters(p,'delimited',r));
 for(const change of [r=>r.finish='execute',r=>r.read.ports=[0],r=>r.mappings=[{}],r=>r.inputs=[{}]]){
  const next=structuredClone(r);change(next);assert.throws(()=>validateTextImportNodeParameters(p,'delimited',next));
 }
 assert.throws(()=>validateTextImportNodeParameters({...p,records:17},'delimited',r));
 assert.throws(()=>validateTextImportNodeParameters({...p,source:{kind:'verified_sources',sources:[p.source]}},'delimited',r));
 assert.throws(()=>validateTextImportNodeParameters({...p,settings:{source:{encoding:'UTF-8'}}},'delimited',r),/storage ref with settings\.source\.source_path/);
});
test('server preview accepts the verified delivery just made, with or without its destination path',()=>{
 // LAB-1735: the first preview after dock_artifact_deliver was refused in 36 of 53 regression runs.
 const delivery={kind:'verified_delivery',artifact_id:'artifact',upload_operation_id:'deliver:upload'};
 const r={target:{kind:'new'},finish:'close',inputs:[],mappings:[],read:{ports:[]}};
 for(const settings of [{source:{encoding:'UTF-8'}},{source:{source_path:'/worker/full.csv',encoding:'UTF-8'}},{source:{}},{}])
  assert.doesNotThrow(()=>validateTextImportNodeParameters({preview_only:true,source:delivery,settings},'delimited',r),JSON.stringify(settings));
 assert.throws(()=>validateTextImportNodeParameters({preview_only:true,source:delivery,settings:{source:{rows_to_skip:1}}},'delimited',r));
 assert.throws(()=>validateTextImportNodeParameters({preview_only:true,source:delivery,settings:{format:{delimiter:';'}}},'delimited',r));
 assert.throws(()=>validateTextImportNodeParameters({preview_only:true,source:delivery,settings:{}},'delimited',{...r,finish:'execute'}),/finish:"close"/);
});

test('server preview accepts an explicit existing source encoding without column edits',()=>{
 const p={source:{kind:'storage',server_source_ref:'storage-one'},settings:{source:{source_path:'/worker/full.csv',encoding:'CP1251'}},preview_only:true};
 const r={target:{kind:'new'},finish:'close',inputs:[],mappings:[],read:{ports:[]}};
 assert.doesNotThrow(()=>validateTextImportNodeParameters(p,'delimited',r));
 assert.throws(()=>validateTextImportNodeParameters({...p,settings:{source:{...p.settings.source,encoding:'guess'}}},'delimited',r));
 assert.throws(()=>validateTextImportNodeParameters({...p,settings:{source:{...p.settings.source,rows_to_skip:1}}},'delimited',r));
});
