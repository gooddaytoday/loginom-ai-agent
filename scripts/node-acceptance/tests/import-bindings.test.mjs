import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {auditImportBindings} from '../import-bindings.mjs';
const root=new URL('../../../docs/node-development/variables/bindings/acceptance/import/',import.meta.url);
const initial=JSON.parse(readFileSync(new URL('expected-initial.json',root))),final=JSON.parse(readFileSync(new URL('expected.json',root)));
test('Import binding scenario uses both approved files and three independent exports',()=>{
 execFileSync('python3',['-B','-c',`import importlib.util
s=importlib.util.spec_from_file_location('r','scripts/node-acceptance/run-check.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
c=m.scenario('import-bindings')
assert c['input_files']==['import-a.csv','import-b.csv'] and c['export_count']==3
assert c['import_initial']=='import/expected-initial.json' and c['prompt'].name=='task-import.md'
`],{cwd:new URL('../../../',import.meta.url)});
});
function history(){
 const node={document_id:'doc',workflow_id:'wf',node_id:'import'},source={...node,node_id:'user'};
 const vars=value=>[{name:'CsvPath',id:1,index:0,type:'string',value},{name:'Sentinel',id:2,index:1,type:'string',value:'keep'}];
 const snapshot=value=>({phase:'node_checkpoint',result:{status:'SUCCEEDED',cleanup_complete:true,node:source,configuration:{readback:{variables:vars(value)}}}});
 const binding={parameter:'/settings/source/source_path',mode:'variable',variable:{name:'CsvPath',type:'string',kind:'variables'},source:{ref:source,type:'variables.user',output:4},verified:true};
 const table=(want,id)=>({phase:'node_checkpoint',result:{status:'SUCCEEDED',cleanup_complete:true,node,configuration:{bindings:[binding]},execution:{status:'completed',execution_id:id},output:{ports:want.outputs.map(o=>({port:o.output_port,fresh:true,execution_id:id,row_count:o.rows.length,sample_complete:true,precision:{numbers_verified:true},schema:o.columns.map(c=>({...c,label:c.name})),sample:o.rows.map(r=>o.columns.map(c=>({type:c.type,is_null:r[c.name]===null,value:r[c.name]===null?null:String(r[c.name]),precision:r[c.name]===null?'exact_null':'exact_integer'})))}))}}});
 const value=final.variable_inventory.outputs[0].variables[0].value;
 return [snapshot('/own/a.csv'),table(initial,'first'),{phase:'node_apply_prepared',request:{target:{kind:'existing',type:'variables.user',ref:source},parameters:{variables:[{name:'CsvPath',type:'string',value}]}}},snapshot(value),table(final,'second')];
}
test('source-only update preserves the Import GUID, variable IDs, Sentinel and field order',()=>{
 assert.equal(auditImportBindings(history(),initial,final).status,'PASS');
});
for(const fault of ['literal','second node','sentinel','variable identity','reconfigure','stale execution'])test('Import oracle refuses '+fault,()=>{
 const e=history();
 if(fault==='literal')delete e[1].result.configuration.bindings;
 if(fault==='second node')e[4].result.node={...e[4].result.node,node_id:'another'};
 if(fault==='sentinel')e[3].result.configuration.readback.variables[1].value='lost';
 if(fault==='variable identity')e[3].result.configuration.readback.variables[0].id=99;
 if(fault==='stale execution')e[4].result.execution.execution_id='first';
 if(fault==='reconfigure')e.splice(4,0,{phase:'node_apply_prepared',request:{target:{kind:'existing',type:'imports.text',ref:e[1].result.node},parameters:{settings:{source:{source_path:'/own/b.csv'}}},inputs:[],mappings:[]}});
 assert.throws(()=>auditImportBindings(e,initial,final));
});

async function coldReadFixture({alias=false,blocked=false}={}){
 const real=await import('../../../packages/loginom-runtime/client/lib/import-bindings.mjs');
 const node={document_id:'doc',workflow_id:'wf',node_id:'import'},source={...node,node_id:'source'};
 const sourceName=alias?'FilePath':'CsvPath',events=[];let selected=false,opened=false,mappingCalls=0;
 const proof={verified:true,cleanup_complete:true,independent_readback:true,variables:[{id:7,name:sourceName,type:'string',cell:{type:'string',is_null:false,value:'/own/b.csv'}}]};
 const mapping={kind:'variables',port:0,port_guid:'input',fields:[{id:9,index:0,name:'CsvPath',label:'CsvPath',type:5,source:{id:7,name:sourceName,type:5}}]};
 const field={status:'observed',variable_mode:true,truncated:false,variable_caption:'CsvPath',row_id:'row'};
 const owner={status:'observed',node:{tid:'flow>Import',label:'Import'},path:[{tid:'flow',label:'Scenario'},{tid:'n',label:'Import'},{tid:'settings',label:'Settings'}]};
 const state=()=>({prepared_node_context:{...node,verified:true,tid:'N',locked:false,surface:opened?'wizard':'graph'},wizard:opened?{status:'observed',stage:'text_import_file',root_ref:'root',root_tid:'W',owner_context:owner,import_source:{fields:{source_path:field}}}:{status:'absent'},ui:{dialogs:[],masks:[],elements:opened?[{ref:'cancel',tid:'W;btnClose',allowed_actions:['click']}]:[
  {ref:'body',tid:'N',graph_node:{part:'body'},interaction:{state:'point_observed'},allowed_actions:['click']},
  ...(selected?[{ref:'settings',tid:'N;Setting',allowed_actions:['begin_wizard'],wizard_open:{node:{node_label:'Import'},workflow_path:[{tid:'flow',label:'Scenario'}]}}]:[])]}});
 const channel={observe:async o=>{if(blocked)throw Error('owned graph is not ready');const s=state();assert.ok(o.ready(s),o.condition);return s;},perform:async o=>{const s=state();assert.ok(o.ready(s),o.condition);const a=o.resolve(s);
  if(a.ref==='body'){selected=true;events.push('select');}else if(a.ref==='settings'){opened=true;events.push('field-open');}else if(a.ref==='cancel'){opened=false;events.push('field-cancel');}else assert.fail('unexpected write');
  return {status:'SUCCEEDED',cleanup_complete:true,output:state()};},readVariablePortMapping:async()=>{mappingCalls++;if(!selected||opened)throw Error('port context menu absent without prepared target');events.push('mapping');return {verified:true,cleanup_complete:true,independent_readback:true,mapping};}};
 const graph={nodes:[{ref:node,type:'imports.text'},{ref:source,type:'variables.user'}],variable_links:[{source:'source',target:'import',kind:'variables',input:0,output:4,target_port_guid:'input'}]};
 const expected={binding_inventory:[{node:{type:'imports.text'},parameter:'/settings/source/source_path',mode:'variable',variable:{name:'CsvPath',type:'string',id:9},source:{type:'variables.user',output:4}}]};
 const {observeImportBindingInventory}=await import('../import-bindings.mjs');
 return {events,get mappingCalls(){return mappingCalls;},run:()=>observeImportBindingInventory({load:async()=>real,graph,expected,channelFor:ref=>ref.node_id==='source'?{configureUserVariables:async()=>{selected=false;events.push('source-cancel');return proof;}}:channel,record:async()=>events.push('record')})};
}
for(const alias of [false,true])test('cold Import restores the prepared target through the real field reader before W1; source alias='+alias,async()=>{
 const f=await coldReadFixture({alias}),inventory=await f.run();assert.equal(inventory[0].bindings[0].source.variable_id,7);
 assert.deepEqual(f.events,['source-cancel','select','field-open','field-cancel','mapping','record']);
});
test('cold Import never starts port mapping when the prepared field/readiness gate refuses',async()=>{
 const f=await coldReadFixture({blocked:true});await assert.rejects(f.run(),/owned graph is not ready/);assert.equal(f.mappingCalls,0);assert.deepEqual(f.events,['source-cancel']);
});
