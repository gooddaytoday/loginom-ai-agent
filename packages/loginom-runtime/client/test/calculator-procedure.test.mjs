import test from 'node:test';
import assert from 'node:assert/strict';
import {configureCalculator} from '../lib/calculator-procedure.mjs';

// A UI model with per-Apply uniqueness and a clipped expression grid. It rejects
// clicks outside the visible page and retains records through edits and moves.
function fixture(names,{pageSize=8,top=0,stuck=false}={}) {
 const expressions=names.map((name,index)=>({name,index,record_id:'r'+index,expression_id:String(index),label:'Same',type:'real',formula:'1',replace:false,intermediate:false,cached:true,description:'Keep '+index,selected:index===0}));
 const calls=[],base='MF;TF;WizrdMCF',prefix=base+';CalcDataWizard;',editor=base+';ExprDataEditForm;';let draft=null;
 const selected=()=>expressions.find(e=>e.selected);
 const control=(tid,allowed_actions,extra={})=>({tid,ref:tid,allowed_actions,interaction:{state:'point_observed'},...extra});
 const snapshot=()=>{
  const rows=expressions.map((e,index)=>control(prefix+'colExpressionName_'+e.name,['click','double_click','scroll'],{
   interaction:{state:index>=top&&index<top+pageSize?'point_observed':'obscured'},bounding_box:{y:(index-top)*24},
   ...(expressions.length>pageSize?{scroll:{ref:'grid',top:top*24,max_top:(expressions.length-pageSize)*24}}:{})}));
  const ui=[...rows,...['btnExprUp','btnReplaceField'].map(k=>control(prefix+k,['click'])),control(prefix+'cmpExpression',['replace_expression'])];
  const wizard={root_tid:base,stage:'calculator'};
  if(draft){wizard.expression_parameters={status:'observed',root_ref:editor,selected_expression:selected().record_id,fields:Object.fromEntries(['name','label'].map(k=>[k,{status:'observed',value:draft[k],input_ref:editor+k}]).concat([['type_label',{status:'observed',value:'Вещественный'}]]))};ui.push(control(editor+'btnApply',['apply_expression_parameters']));}
  return structuredClone({wizard,ui:{elements:ui},node_calculator:{verified:true,mode:'expression',inventory_complete:true,input_fields:[],expressions}});
 };
 const channel={async observe({ready}){const s=snapshot();assert.ok(ready(s));return s},async perform({ready,resolve}){
  const s=snapshot();assert.ok(ready(s));const action=resolve(s);calls.push(action);
  if(action.verb==='scroll'){if(!stuck)top=Math.max(0,Math.min(expressions.length-pageSize,top+Math.round(action.delta_y/24)));return;}
  if(action.ref.startsWith(prefix+'colExpressionName_')){
   const e=expressions.find(e=>prefix+'colExpressionName_'+e.name===action.ref);assert.ok(e);assert.ok(e.index>=top&&e.index<top+pageSize,'Hidden row clicked');
   expressions.forEach(r=>r.selected=r===e);if(action.verb==='double_click')draft={...e};return;
  }
  if(action.verb==='set_wizard_field'){draft[action.ref.slice(editor.length)]=action.text;return;}
  if(action.verb==='apply_expression_parameters'){
   assert.ok(!expressions.some(e=>e!==selected()&&e.name.toLowerCase()===draft.name.toLowerCase()),'Duplicate name rejected by Loginom');Object.assign(selected(),draft);draft=null;return;
  }
  if(action.verb==='replace_expression'){selected().formula=action.text;return;}
  if(action.ref===prefix+'btnExprUp'){const index=selected().index;[expressions[index],expressions[index-1]]=[expressions[index-1],expressions[index]];expressions.forEach((e,i)=>e.index=i);return;}
  throw Error('Unexpected action '+JSON.stringify(action));
 }};
 return {channel,calls,expressions};
}
test('cyclic rename keeps both record identities, formulas and unrequested options',async()=>{
 const f=fixture(['A','B','Untouched']);const result=await configureCalculator(f.channel,{expressions:[{target:{kind:'existing',name:'A'},name:'B',formula:'2'},{target:{kind:'existing',name:'B'},name:'A',formula:'3'}]});
 assert.equal(result.verified,true);assert.deepEqual(f.expressions.map(e=>[e.record_id,e.name,e.formula,e.description,e.cached]),[['r0','B','2','Keep 0',true],['r1','A','3','Keep 1',true],['r2','Untouched','1','Keep 2',true]]);
 assert.equal(f.calls.filter(c=>c.verb==='apply_expression_parameters').length,3);
});
test('patching a far row reveals it in both directions before editing',async()=>{
 const f=fixture(Array.from({length:40},(_,i)=>'E'+i));await configureCalculator(f.channel,{expressions:[{target:{kind:'existing',name:'E39'},formula:'39'},{target:{kind:'existing',name:'E0'},formula:'40'}]});
 assert.equal(f.expressions[39].formula,'39');assert.equal(f.expressions[0].formula,'40');
 assert.ok(f.calls.some(c=>c.verb==='scroll'&&c.delta_y>0));assert.ok(f.calls.some(c=>c.verb==='scroll'&&c.delta_y<0));
});
test('unchanged execution does not visit every expression or move selection',async()=>{
 const f=fixture(Array.from({length:40},(_,i)=>'E'+i),{top:32});const result=await configureCalculator(f.channel,{expressions:[]});assert.equal(result.effect_possible,false);assert.deepEqual(f.calls,[]);
});
test('explicit order reveals and moves the retained far record',async()=>{
 const names=Array.from({length:40},(_,i)=>'E'+i),f=fixture(names),order=[names.at(-1),...names.slice(0,-1)];
 await configureCalculator(f.channel,{expressions:[],order});assert.deepEqual(f.expressions.map(e=>e.name),order);assert.equal(f.expressions[0].record_id,'r39');
});
test('a blocked scroller fails without attempting a hidden row click',async()=>{
 const f=fixture(Array.from({length:40},(_,i)=>'E'+i),{stuck:true});await assert.rejects(configureCalculator(f.channel,{expressions:[{target:{kind:'existing',name:'E39'},formula:'2'}]}),/no progress/);assert.deepEqual(f.calls.map(c=>c.verb),['scroll']);
});
