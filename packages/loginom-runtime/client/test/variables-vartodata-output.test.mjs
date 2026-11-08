import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {configureVariablesToTableOutput} from '../lib/variables-vartodata-output.mjs';
const variables=JSON.parse(readFileSync(new URL('../../../../docs/node-development/nodes/variables-vartodata/fixtures/variables.json',import.meta.url)));
function fixture(change=()=>{},mode='columns'){
 const source_fields=variables.map(({name,label,type},index)=>({index,name,label,type,record_id:'s'+index,field_id:String(index),required:true}));
 const node={verified:true,document_id:'doc',workflow_id:'wf',node_id:'n',surface:'wizard',output_port:{port:0}};
 const native={verified:true,inventory_complete:true,source_identity_verified:true,node_context:node,autosync:true,
  mapping_wizard:'DerivedDataSourceOutputSocketWizard',source_fields,
  target_fields:source_fields.map((source,index)=>({...source,index,record_id:'t'+index,source,excluded:false,inherited:false,data_kind:'Непрерывный'}))};
 change(native);
 const actions=[],channel={observe:async spec=>{const s={wizard:{stage:'output_mapping'},prepared_node_context:node,node_mapping:native};assert.ok(spec.ready(s));return structuredClone(s);},
  perform:async()=>{actions.push('unexpected');throw Error('unexpected mutation');}};
 return {native,actions,run:(mapping={})=>configureVariablesToTableOutput(channel,{mode,node_context:{...node,output_port:undefined}}, {},mapping)};
}
test('complete columns output retains all eight source names, labels, scalar types and native order without a gesture',async()=>{
 const f=fixture(),result=await f.run();assert.deepEqual(result.native_mapping,f.native);assert.equal(result.effect_possible,false);assert.deepEqual(f.actions,[]);
});
test('incomplete, foreign, duplicate, unsupported or wrongly typed output refuses before an edit',async()=>{
 for(const change of [n=>n.target_fields.pop(),n=>n.target_fields[0].source=null,
  n=>n.target_fields[1].source=n.source_fields[0],n=>n.source_fields[0].type='variant',n=>n.target_fields[0].type='string',
  n=>n.source_identity_verified=false,n=>n.node_context.output_port.port=1]){
  const f=fixture(change);await assert.rejects(f.run());assert.deepEqual(f.actions,[]);
 }
});
test('foreign output mapping selectors refuse before editing native metadata',async()=>{
 const f=fixture();await assert.rejects(f.run({fields:[{source:{kind:'configured_field',name:'Foreign'}}]}));assert.deepEqual(f.actions,[]);
});

const rowFields=[{name:'Name',label:'Имя',type:'string'},{name:'DisplayName',label:'Метка',type:'string'},{name:'Value',label:'Значение',type:'variant'}];
function rowsFixture(change=()=>{}){return fixture(n=>{
 n.source_fields=rowFields.map((f,index)=>({...f,index,record_id:'s'+index}));
 n.target_fields=n.source_fields.map((source,index)=>({...source,index,record_id:'t'+index,source,excluded:false,inherited:false,data_kind:'Непрерывный'}));change(n);
},'rows');}
test('rows derives the exact three fields including native Variant without coercion',async()=>{
 const f=rowsFixture(),r=await f.run();assert.deepEqual(r.native_mapping,f.native);assert.deepEqual(f.actions,[]);
});
test('rows refuses missing, reordered, renamed or wrongly typed derived fields',async()=>{
 for(const change of [n=>n.source_fields.pop(),n=>n.source_fields.reverse(),n=>n.source_fields[2].type='string',n=>n.source_fields[0].name='Other']){
  const f=rowsFixture(change);await assert.rejects(f.run());assert.deepEqual(f.actions,[]);
 }
});

test('sources not yet retrieved after an upstream change are fetched once with the native control, then validated',async()=>{
 const f=rowsFixture();const full=structuredClone(f.native.source_fields),targets=f.native.target_fields;
 f.native.source_fields=[];f.native.source_identity_verified=false;f.native.target_fields=targets.map(t=>({...t,source:null}));
 const node=f.native.node_context,actions=[];let view='table',fetched=false;
 const el=(key,extra={})=>({tid:'root;DerivedDataSourceOutputSocketWizard;'+key,ref:'ref-'+key,allowed_actions:['click'],...extra});
 const state=()=>({wizard:{stage:'output_mapping',root_tid:'root',root_ref:'rr'},prepared_node_context:node,node_mapping:f.native,
  ui:{elements:[el('rbLinks;DisplayEl'),el('rbTable;DisplayEl'),...(view==='links'?[el('btnGetSourceColumns')]:[])]}});
 const channel={observe:async spec=>{const s=state();assert.ok(spec.ready(s),spec.condition);return structuredClone(s);},
  perform:async spec=>{const s=state();assert.ok(spec.ready(s));const a=spec.resolve(s);actions.push(a.ref);
   if(a.ref==='ref-rbLinks;DisplayEl')view='links';
   if(a.ref==='ref-btnGetSourceColumns'){fetched=true;f.native.source_fields=full;f.native.source_identity_verified=true;f.native.target_fields=targets;}
   if(a.ref==='ref-rbTable;DisplayEl')view='table';}};
 const r=await configureVariablesToTableOutput(channel,{mode:'rows',node_context:{...node,output_port:undefined}},{},{});
 assert.equal(fetched,true);assert.deepEqual(actions,['ref-rbLinks;DisplayEl','ref-btnGetSourceColumns','ref-rbTable;DisplayEl']);
 assert.deepEqual(r.native_mapping.source_fields.map(x=>x.name),['Name','DisplayName','Value']);
});
