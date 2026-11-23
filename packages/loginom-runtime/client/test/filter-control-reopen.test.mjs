import test from 'node:test';
import assert from 'node:assert/strict';
import {configureFilter} from '../lib/filter-procedure.mjs';

const parameters={groups:[[{field:{kind:'input_field',name:'Amount'},type:'integer',operator:'>=',value:{kind:'variable',name:'limit'}}]]};
function fixture({stillNull=false,fault,initialNull=true,allowUnrefreshedEdit=false}={}){
 const node={document_id:'doc',workflow_id:'flow',node_id:'filter'},root='WF;WizrdMCF',path=[{tid:'flow',label:'Scenario'}];
 const owner={status:'observed',node:{tid:'flow>Filter',label:'Filter'},path:[...path,{tid:'flow>Filter',label:'Filter'},{tid:'flow>Filter>Settings',label:'Settings'}]};
 let surface='wizard',reopened=false;const actions=[];
 const snapshot=()=>{
  const n={...node,verified:true,surface,locked:false,tid:'WF;Graph;Filter'};
  const fields=[{record_id:reopened?'fresh-column':'old-column',name:'Amount',label:'Amount',type:'integer',data_kind:'Дискретный'}];
  const vars=[{name:'limit',type:'integer',index:0,value:initialNull&&(!reopened||stillNull)?null:10,is_null:initialNull&&(!reopened||stillNull)}];
  if(reopened&&fault==='node')n.node_id='foreign';
  if(reopened&&fault==='schema')fields[0].name='Other';
  if(reopened&&fault==='binding')vars[0].index=1;
  const w=surface==='graph'?{status:'absent'}:{status:'observed',stage:'row_filter',root_tid:fault==='root'&&reopened?'FOREIGN;WizrdMCF':root,root_ref:reopened?'fresh-wizard':'old-wizard',owner_context:{...owner,node:{...owner.node,ref:reopened?'fresh-owner':'old-owner'}}};
  return {prepared_node_context:n,wizard:w,node_filter:{verified:true,inventory_complete:true,node_context:n,input_fields:fields,control_variables:vars,
   rows:[{record_id:reopened?'fresh-row':'old-row',kind:'condition',field:{kind:'input_field',name:''},type:null,index:0,cells:{delete:'delete'}}],dialogs:[],editor:null},ui:{dialogs:[],masks:[],elements:surface==='graph'?
    [{ref:'settings',tid:n.tid+';Setting',allowed_actions:['begin_wizard'],wizard_open:{node:{node_label:'Filter'},workflow_path:path}}]:
    [{ref:'close',tid:w.root_tid+';btnClose',allowed_actions:['click']},{ref:'delete',tid:'delete',allowed_actions:['click'],interaction:{state:'point_observed',point:{y:12}},bounding_box:{y:0,height:24}}]}};
 };
 const channel={observe:async o=>{const s=snapshot();assert.ok(o.ready(s),o.condition);return structuredClone(s);},perform:async o=>{
  const s=snapshot();assert.ok(o.ready(s),o.condition);const a=o.resolve(s);actions.push(a);
  if(a.ref==='close'){surface='graph';if(fault==='lostClose')throw Error('LOST_CLOSE_REPLY');return {status:'SUCCEEDED',cleanup_complete:true};}
  if(a.verb==='begin_wizard'){surface='wizard';reopened=true;if(fault==='lostOpen')throw Error('LOST_OPEN_REPLY');return {status:'SUCCEEDED',cleanup_complete:true};}
  assert.equal(reopened||!initialNull||allowUnrefreshedEdit,true,'No conditions may change before the fresh control read');
  assert.equal(a.ref,'delete');throw Error('EDIT_AFTER_FRESH_CACHE');
 }};
 return {channel,actions};
}

test('new Filter reopens its first NULL cache once before condition edits through production close/open',async()=>{
 const f=fixture();await assert.rejects(configureFilter(f.channel,parameters,{newNode:true}),/EDIT_AFTER_FRESH_CACHE/);
 assert.deepEqual(f.actions.map(a=>a.ref),['close','settings','delete']);
});
test('a genuine NULL after reopen still refuses before any condition edit, without another reopen',async()=>{
 const f=fixture({stillNull:true});await assert.rejects(configureFilter(f.channel,parameters,{newNode:true}),/Filter variable type or NULL differs/);
 assert.deepEqual(f.actions.map(a=>a.ref),['close','settings']);
});
for(const fault of ['node','root','schema','binding'])test('new Filter refuses changed '+fault+' identity after its one reopen',async()=>{
 const f=fixture({fault});await assert.rejects(configureFilter(f.channel,parameters,{newNode:true}));
 assert.deepEqual(f.actions.map(a=>a.ref),['close','settings']);
});
test('an existing Filter with NULL never receives the new-node reopen route',async()=>{
 const f=fixture();await assert.rejects(configureFilter(f.channel,parameters),/Filter variable type or NULL differs/);assert.deepEqual(f.actions,[]);
});
test('already materialized control values do not close or reopen the new wizard',async()=>{
 const f=fixture({initialNull:false});await assert.rejects(configureFilter(f.channel,parameters,{newNode:true}),/EDIT_AFTER_FRESH_CACHE/);assert.deepEqual(f.actions.map(a=>a.ref),['delete']);
});

for(const fault of ['lostClose','lostOpen'])test('no second gesture after uncertain '+fault,async()=>{
 const f=fixture({fault});await assert.rejects(configureFilter(f.channel,parameters,{newNode:true}),/LOST_/);
 assert.deepEqual(f.actions.map(a=>a.ref),fault==='lostClose'?['close']:['close','settings']);
});
test('literal conditions do not reopen a wizard for unrelated NULL control values',async()=>{
 const f=fixture({allowUnrefreshedEdit:true});const p=structuredClone(parameters);p.groups[0][0].value=10;
 await assert.rejects(configureFilter(f.channel,p,{newNode:true}),/EDIT_AFTER_FRESH_CACHE/);assert.deepEqual(f.actions.map(a=>a.ref),['delete']);
});
test('a validated connected source can configure the new variable operand while its engine cache is pending',async()=>{
 const f=fixture({stillNull:true,allowUnrefreshedEdit:true});
 await assert.rejects(configureFilter(f.channel,parameters,{newNode:true,controlVariables:[{name:'limit',type:'integer',index:0,value:10,is_null:false}]}),/EDIT_AFTER_FRESH_CACHE/);
 assert.deepEqual(f.actions.map(a=>a.ref),['delete']);
 assert.deepEqual(parameters.groups[0][0].value,{kind:'variable',name:'limit'});
});
