import test from 'node:test';
import assert from 'node:assert/strict';
import {configureSmoothing} from '../lib/smoothing-procedure.mjs';
import {validateUiAction} from '../lib/workspace-ui.mjs';
function fixture(){
 const fields=[{index:0,record_id:'x',name:'X',label:'X',type:'integer',data_kind:'Непрерывный',used:false,algorithm:0},{index:1,record_id:'r',name:'R',label:'R',type:'real',data_kind:'Непрерывный',used:true,algorithm:0}];
 const inputMapping={verified:true,inventory_complete:true,target_fields:[...structuredClone(fields),{name:'Tag',label:'Tag',type:'string',data_kind:'Дискретный'}]};
 const settings=new Map(fields.map(f=>[f.record_id,{lambda:1600,period:39.7,strength:'lambda'}])),actions=[];
 const state={wizard:{status:'observed',stage:'smoothing',root_tid:'W'},node_smoothing:{verified:true,inventory_complete:true,binding_ready:true,fields,selected:null,settings:null,node_context:{verified:true,node_id:'n'}},ui:{elements:[]}};
 const base='W;SmoothingWizard;';
 function refresh(){
  const selected=state.node_smoothing.selected;state.node_smoothing.settings=selected?.used?settings.get(selected.record_id):null;
  state.ui.elements=fields.flatMap(f=>['field','used'].map(part=>({tid:base+(part==='field'?'colDisplayName_':'colUsable_')+f.name,ref:'ui-'+f.record_id+'-'+part,smoothing_cell:{part,record_id:f.record_id},allowed_actions:['click']})));
  if(selected?.used)for(const title of ['Lambda','Period'])for(const kind of ['rb','edt']){
   const key=kind+title+';ValueControl'+(kind==='rb'?';DisplayEl':'');
   state.ui.elements.push({tid:base+key,identity:{anchor_tid:base+key},ref:'ui-'+key.replaceAll(';','-'),allowed_actions:kind==='rb'?['click']:['fill','press']});
  }
 }
 const channel={async observe(options){refresh();assert.ok(options.ready(state),options.condition);return structuredClone(state);},async perform(options){
  refresh();assert.ok(options.ready(state),options.condition);const action=options.resolve(state);validateUiAction(action,state);actions.push(action);
  const cell=state.ui.elements.find(e=>e.ref===action.ref)?.smoothing_cell;
  if(cell){state.node_smoothing.selected=fields.find(f=>f.record_id===cell.record_id);if(cell.part==='used')state.node_smoothing.selected.used=!state.node_smoothing.selected.used;}
  else {
   const setting=settings.get(state.node_smoothing.selected.record_id),key=action.ref.includes('Lambda')?'lambda':'period';
   if(action.verb==='click')setting.strength=key;
   if(action.verb==='fill'){setting[key]=Number(action.text);if(key==='lambda'&&setting.lambda===1)setting.period=6;}
  }
  refresh();
 }};
 return {channel,inputMapping,actions,settings,state};
}
test('HP production procedure binds each enabled field and verifies lambda or period',async()=>{
 const f=fixture(),result=await configureSmoothing(f.channel,{smoothing:[{field:'X',lambda:1},{field:'R',period:6}]},f);
 assert.deepEqual(result.configuration.fields.map(f=>[f.name,f.used,f.strength,f[f.strength]]),[['X',true,'lambda',1],['R',true,'period',6]]);
 assert.equal(result.configuration.input_fields.at(-1).name,'Tag');
 assert.equal(f.actions.filter(a=>a.ref==='ui-x-used').length,1);
 assert.equal(f.actions.filter(a=>a.verb==='fill').length,2);
});
test('HP production procedure preserves omission and disables all with explicit empty rules',async()=>{
 const f=fixture(),kept=await configureSmoothing(f.channel,{},f);
 assert.equal(kept.configuration.fields[1].lambda,1600);
 assert.equal(f.actions.filter(a=>a.verb==='fill'||a.ref.endsWith('-used')).length,0);
 const cleared=await configureSmoothing(f.channel,{smoothing:[]},f);
 assert.equal(cleared.configuration.fields.some(f=>f.used),false);
});
