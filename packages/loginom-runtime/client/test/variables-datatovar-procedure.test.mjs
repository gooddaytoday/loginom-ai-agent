import test from 'node:test';
import assert from 'node:assert/strict';
import {configureDataToVar,configureDataToVarWizard} from '../lib/variables-datatovar-procedure.mjs';

const spec=(name='X',aggregations=['sum','count','min','max','avg'])=>({fields:[{field:{kind:'input_field',name},aggregations}]});
function fixture(){
 const owner={verified:true,surface:'wizard',document_id:'d',workflow_id:'w',node_id:'n'};
 const fields=['RowID','X','Category'].map((name,i)=>({record_id:'r'+i,name,label:name,type:i===2?'string':'integer',role:i===0?'selected':'available',order:i===0?0:-1,functions:i===0?1:0,settings:{Separator:',',Wrapper:'',UniqueOnly:false}}));
 let selected=fields[0],editor=null,moves=0,omit='',done=false;const mutations=[];
 const state=()=>{
  const used=fields.filter(f=>f.role==='selected').sort((a,b)=>a.order-b.order);
  return {prepared_node_context:structuredClone(owner),wizard:{root_tid:'W',stage:done?'done':'datatovar',...(editor?{factor_editor:{status:'rendered_factor_options',selected_field:{field_key:editor.name},options:['sum','count','min','max','average','median','mode','standard_deviation','unique_count','null_count','first','last','only','concat'].map((aggregation,i)=>({aggregation,display_ref:'check'+i,checked:!!(editor.draft&(1<<i)),enabled:true}))}}:{})},
   node_datatovar:{verified:true,inventory_complete:true,input_fields:structuredClone(fields),fields:structuredClone(used),node_context:structuredClone(owner),selections:{available:selected?.role==='available'?[selected.record_id]:[],selected:selected?.role==='selected'?[selected.record_id]:[]}},
   ui:{elements:[...fields.filter(f=>f.name!==omit).map(f=>({ref:f.name,tid:'W;DataToVariablesWizard;'+(f.role==='available'?'colDisplayName_':'colUsedFields_')+f.name,datatovar_field:{field_key:f.name,record_id:f.record_id,role:f.role},allowed_actions:['click','double_click','press']})),
    // Real discovery: the summary cell repeats tid but owns no native record.
    ...used.map(f=>({ref:'summary-'+f.name,tid:'W;DataToVariablesWizard;colUsedFields_'+f.name,label:'',allowed_actions:['click','double_click']})),
    {tid:'W;btnNext',ref:'Next',allowed_actions:['wizard_step']},
    ...['DataToVariablesWizard;frmMoveButtons;btnMove0','DataToVariablesWizard;btnUp','FactorEditDialog;btnApply'].map(k=>({tid:'W;'+k,ref:k,allowed_actions:['click']}))]}};
 };
 const channel={observe:async o=>{const s=state();assert.ok(o.ready(s),o.condition);return s;},perform:async o=>{
  const s=state();assert.ok(o.ready(s),o.condition);const action=o.resolve(s);mutations.push(action);moves++;
  if(action.verb==='wizard_step'){assert.equal(action.ref,'Next');assert.equal(action.expected_stage,'done');done=true;return;}
  if(action.verb==='set_checked'){const bit=1<<Number(action.ref.slice(5));if(action.checked)editor.draft|=bit;else editor.draft&=~bit;return;}
  if(action.ref==='FactorEditDialog;btnApply'){editor.field.functions=editor.draft;editor=null;return;}
  if(action.verb==='double_click'){assert.equal(action.ref,selected.name);editor={field:selected,name:selected.name,draft:selected.functions};return;}
  if(action.verb==='press'){
   assert.equal(action.key,'Delete');const old=selected.order;selected.role='available';selected.order=-1;
   fields.filter(f=>f.role==='selected'&&f.order>old).forEach(f=>f.order--);return;
  }
  if(action.ref.endsWith('btnMove0')){selected.order=fields.filter(f=>f.role==='selected').length;selected.role='selected';selected.functions=1;return;}
  if(action.ref.endsWith('btnUp')){const previous=fields.find(f=>f.role==='selected'&&f.order===selected.order-1);assert.ok(previous);previous.order++;selected.order--;return;}
  selected=fields.find(f=>f.name===action.ref);assert.ok(selected,'summary cannot be selected');
 }};
 return {channel,fields,owner,mutations,moves:()=>moves,omit:name=>omit=name};
}

test('DataToVar replaces selected fields and applies the exact native function bitset',async()=>{
 const f=fixture(),r=await configureDataToVar(f.channel,spec());
 assert.deepEqual(r.configuration.fields.map(x=>[x.name,x.functions]),[['X',31]]);
 assert.equal(r.preservation.input_identity,true);assert.equal(r.configuration.settings_applied,undefined);
 assert.ok(!f.mutations.some(a=>a.ref.startsWith('summary-')));
 const count=f.moves();const preserved=await configureDataToVar(f.channel,{});
 assert.equal(preserved.effect_possible,false);assert.equal(f.moves(),count);
});

test('DataToVar Next validation is required for Done/Execute and omitted for Close',async()=>{
 for(const finish of ['done','execute','close']){
  const f=fixture(),r=await configureDataToVarWizard(f.channel,spec(),{finish,newNode:true});
  assert.equal(f.mutations.filter(a=>a.verb==='wizard_step').length,finish==='close'?0:1);
  assert.equal(r.validation?.status,finish==='close'?undefined:'accepted_by_loginom_next');
 }
});

test('DataToVar enables requested factors before disabling the old last factor and preserves exact field order',async()=>{
 const f=fixture();f.fields[1].role='selected';f.fields[1].order=1;f.fields[1].functions=1;
 const r=await configureDataToVar(f.channel,{fields:[...spec('X',['count']).fields,...spec('RowID',['min','max']).fields]});
 assert.deepEqual(r.configuration.fields.map(x=>[x.name,x.functions]),[['X',2],['RowID',12]]);
 const checks=f.mutations.filter(a=>a.verb==='set_checked');assert.equal(checks[0].checked,true);
});

test('DataToVar refuses unsupported/missing fields and incomplete preservation before any gesture',async()=>{
 for(const p of [spec('missing'),spec('Category'),spec('X',['median']),{fields:[]}]){
  const f=fixture();await assert.rejects(configureDataToVar(f.channel,p));assert.equal(f.moves(),0);
 }
 const f=fixture();f.fields[0].functions=32;await assert.rejects(configureDataToVar(f.channel,{}),/unsupported/);assert.equal(f.moves(),0);
 const empty=fixture();await assert.rejects(configureDataToVar(empty.channel,{}, {newNode:true}));assert.equal(empty.moves(),0);
});

test('DataToVar refuses unknown effect, changed ownership and missing exact row without replaying',async()=>{
 const f=fixture();const original=f.channel.perform;f.channel.perform=async()=>{throw Error('unknown effect');};
 await assert.rejects(configureDataToVar(f.channel,spec()),/unknown effect/);assert.equal(f.moves(),0);
 f.channel.perform=original;f.omit('X');await assert.rejects(configureDataToVar(f.channel,spec()),/revealed|row/);
 const g=fixture(),observe=g.channel.observe;let count=0;
 g.channel.observe=async o=>{const s=await observe(o);if(++count===2)s.node_datatovar.node_context.node_id='foreign';return s;};
 await assert.rejects(configureDataToVar(g.channel,spec()),/owner/);assert.equal(g.moves(),0);
});
