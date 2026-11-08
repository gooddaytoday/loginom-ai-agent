import test from 'node:test';
import assert from 'node:assert/strict';
import {configureCalculator,previewCalculator} from '../lib/calculator-procedure.mjs';

// A UI model with per-Apply uniqueness and a clipped expression grid. It rejects
// clicks outside the visible page and retains records through edits and moves.
function fixture(names,{pageSize=8,top=0,stuck=false,syntax='expression'}={}) {
 const expressions=names.map((name,index)=>({name,index,record_id:'r'+index,expression_id:String(index),label:'Same',type:'real',formula:'1',replace:false,intermediate:false,cached:true,description:'Keep '+index,selected:index===0}));
 const calls=[],base='MF;TF;WizrdMCF',prefix=base+';CalcDataWizard;',editor=base+';ExprDataEditForm;';let draft=null,menuOpen=false;
 const selected=()=>expressions.find(e=>e.selected);
 const control=(tid,allowed_actions,extra={})=>({tid,ref:tid,allowed_actions,interaction:{state:'point_observed'},...extra});
 const snapshot=()=>{
  const rows=expressions.map((e,index)=>control(prefix+'colExpressionName_'+e.name,['click','double_click','scroll'],{
   interaction:{state:index>=top&&index<top+pageSize?'point_observed':'obscured'},bounding_box:{y:(index-top)*24},
   ...(expressions.length>pageSize?{scroll:{ref:'grid',top:top*24,max_top:(expressions.length-pageSize)*24}}:{})}));
  const ui=[...rows,...['btnExprUp','btnReplaceField','btnAddExpr'].map(k=>control(prefix+k,['click'])),control(prefix+'cmpExpression',['replace_expression']),control(prefix+'btnCalcMode',['click','press'])];
  if(menuOpen)for(const k of ['cmExpression','cmJavaScript'])ui.push(control(prefix+'btnCalcMode;mn;'+k,['click']));
  const wizard={root_tid:base,stage:'calculator'};
  if(draft){wizard.expression_parameters={status:'observed',root_ref:editor,selected_expression:selected().record_id,fields:Object.fromEntries(['name','label'].map(k=>[k,{status:'observed',value:draft[k],input_ref:editor+k}]).concat([['type_label',{status:'observed',value:'Вещественный'}]]))};ui.push(control(editor+'btnApply',['apply_expression_parameters']));
   wizard.expression_parameters.options={};
   for(const [key,tid] of [['intermediate','chbIntermediate'],['cached','chbCached']]){
    wizard.expression_parameters.options[key]={status:'observed',value:draft[key],enabled:true,input_ref:editor+tid+';InputEl',display_ref:editor+tid+';DisplayEl'};
    for(const part of ['InputEl','DisplayEl'])ui.push(control(editor+tid+';'+part,['set_checked'],{check_state:{kind:'checkbox',checked:draft[key],indeterminate:false}}));
   }}
  return structuredClone({wizard,ui:{elements:ui,dialogs:[]},node_calculator:{verified:true,mode:'expression',syntax,inventory_complete:true,input_fields:[],expressions}});
 };
 const channel={async observe({ready}){const s=snapshot();assert.ok(ready(s));return s},async perform({ready,resolve}){
  const s=snapshot();assert.ok(ready(s));const action=resolve(s);calls.push(action);
  if(action.verb==='scroll'){if(!stuck)top=Math.max(0,Math.min(expressions.length-pageSize,top+Math.round(action.delta_y/24)));return;}
  if(action.ref===prefix+'btnCalcMode'){assert.equal(action.verb,'press');assert.equal(action.key,'ArrowDown');menuOpen=true;return;}
  if(action.ref.startsWith(prefix+'btnCalcMode;mn;')){assert.ok(menuOpen,'Menu closed');syntax=action.ref.endsWith('cmJavaScript')?'javascript':'expression';menuOpen=false;return;}
  if(action.ref.startsWith(prefix+'colExpressionName_')){
   const e=expressions.find(e=>prefix+'colExpressionName_'+e.name===action.ref);assert.ok(e);assert.ok(e.index>=top&&e.index<top+pageSize,'Hidden row clicked');
   expressions.forEach(r=>r.selected=r===e);if(action.verb==='double_click')draft={...e};return;
  }
  if(action.ref===prefix+'btnAddExpr'){
   const e={name:'Expr'+expressions.length,index:expressions.length,record_id:'n'+expressions.length,label:'Expr',type:'real',formula:'',replace:false,intermediate:false,cached:false,description:''};
   expressions.forEach(r=>r.selected=false);e.selected=true;expressions.push(e);draft={...e};return;
  }
  if(action.verb==='set_checked'){assert.ok(draft,'Editor closed');const key=action.ref.includes('chbCached')?'cached':'intermediate';draft[key]=action.checked;return;}
  if(action.verb==='set_wizard_field'){draft[action.ref.slice(editor.length)]=action.text;return;}
  if(action.verb==='apply_expression_parameters'){
   assert.ok(!expressions.some(e=>e!==selected()&&e.name.toLowerCase()===draft.name.toLowerCase()),'Duplicate name rejected by Loginom');Object.assign(selected(),draft);draft=null;return;
  }
  if(action.verb==='replace_expression'){selected().formula=action.text;return;}
  if(action.ref===prefix+'btnExprUp'){const index=selected().index;[expressions[index],expressions[index-1]]=[expressions[index-1],expressions[index]];expressions.forEach((e,i)=>e.index=i);return;}
  throw Error('Unexpected action '+JSON.stringify(action));
 }};
 return {channel,calls,expressions,syntax:()=>syntax};
}
test('cyclic rename keeps both record identities, formulas and unrequested options',async()=>{
 const f=fixture(['A','B','Untouched']);const result=await configureCalculator(f.channel,{expressions:[{target:{kind:'existing',name:'A'},name:'B',formula:'2'},{target:{kind:'existing',name:'B'},name:'A',formula:'3'}]});
 assert.equal(result.verified,true);assert.deepEqual(f.expressions.map(e=>[e.record_id,e.name,e.formula,e.description,e.cached]),[['r0','B','2','Keep 0',true],['r1','A','3','Keep 1',true],['r2','Untouched','1','Keep 2',true]]);
 assert.equal(f.calls.filter(c=>c.verb==='apply_expression_parameters').length,3);
});
test('new intermediate cached expression is created with both flags checked before one Apply',async()=>{
 const f=fixture(['A']);
 await configureCalculator(f.channel,{expressions:[{target:{kind:'new'},name:'Helper',label:'Helper',type:'real',formula:'A + 1',replace:false,intermediate:true,cached:true}]});
 const h=f.expressions.find(e=>e.name==='Helper');
 assert.deepEqual([h.intermediate,h.cached,h.formula],[true,true,'A + 1']);
 assert.deepEqual(f.calls.filter(c=>c.verb==='set_checked').map(c=>[c.ref.split(';').slice(-2).join(';'),c.checked]),[['chbIntermediate;InputEl',true],['chbCached;InputEl',true]]);
 assert.equal(f.calls.filter(c=>c.verb==='apply_expression_parameters').length,1);
});
test('changing only cached reopens that saved row, keeps its record, formula and other flags',async()=>{
 const f=fixture(['A','Helper']);f.expressions[1].intermediate=true;
 await configureCalculator(f.channel,{expressions:[{target:{kind:'existing',name:'Helper'},cached:false}]});
 const h=f.expressions[1];assert.deepEqual([h.record_id,h.formula,h.description,h.intermediate,h.cached],['r1','1','Keep 1',true,false]);
 assert.deepEqual(f.calls.filter(c=>c.verb==='set_checked').map(c=>c.checked),[false]);
 assert.deepEqual(f.calls.filter(c=>c.verb==='double_click').length,1);
 assert.equal(f.calls.filter(c=>c.verb==='set_wizard_field').length,0);
});
test('a flag that already has the requested value is not toggled',async()=>{
 const f=fixture(['A']);await configureCalculator(f.channel,{expressions:[{target:{kind:'existing',name:'A'},cached:true,intermediate:false}]});
 assert.deepEqual(f.calls,[]);
});
test('a disabled flag is refused before Apply',async()=>{
 const f=fixture(['A']),observe=f.channel.observe;
 f.channel.observe=async o=>{const s=await observe(o);for(const k of ['intermediate','cached'])if(s.wizard.expression_parameters?.options)s.wizard.expression_parameters.options[k].enabled=false;return s;};
 await assert.rejects(configureCalculator(f.channel,{expressions:[{target:{kind:'existing',name:'A'},intermediate:true}]}),/option unavailable: intermediate/);
 assert.equal(f.calls.filter(c=>c.verb==='apply_expression_parameters').length,0);
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

test('valid formulas complete one owned Preview and close it before returning to configuration',async()=>{
 const calls=[],base='MF;TF;WizrdMCF',expression={name:'Revenue',formula:'2',type:'integer'};
 let opened=false;
 const snapshot=()=>({prepared_node_context:{node_id:'n'},wizard:{stage:'calculator',root_tid:base,
  ...(opened?{calculator_preview:{status:'observed',root_ref:'preview',errors:[]}}:{})},
  ui:{dialogs:opened?[{}]:[],elements:[{tid:base+(opened?';CalcPreviewForm;p.h;close':';CalcDataWizard;btnPreview'),ref:opened?'close':'preview',allowed_actions:['click']}]},
  node_calculator:{verified:true,expressions:[expression]}});
 const channel={observe:async({ready})=>{const s=snapshot();assert.ok(ready(s));return structuredClone(s)},
  perform:async({ready,resolve})=>{const s=snapshot();assert.ok(ready(s));calls.push(resolve(s));opened=!opened;}};
 assert.equal((await previewCalculator(channel)).status,'accepted_by_loginom_preview');
 assert.deepEqual(calls,[{verb:'click',ref:'preview'},{verb:'click',ref:'close'}]);
 assert.equal(opened,false);
});

test('a requested language is chosen once through the menu before any expression is edited',async()=>{
 const f=fixture(['A']);
 await configureCalculator(f.channel,{syntax:'javascript',expressions:[{target:{kind:'existing',name:'A'},formula:'return Amount;'}]});
 assert.equal(f.syntax(),'javascript');
 const verbs=f.calls.map(c=>c.verb+':'+c.ref.split(';').slice(-1)[0]);
 assert.deepEqual(verbs.slice(0,2),['press:btnCalcMode','click:cmJavaScript']);
 assert.equal(f.calls.filter(c=>c.ref.includes('btnCalcMode')).length,2);
 assert.equal(f.expressions[0].formula,'return Amount;');
});
test('the language is left alone when it is omitted or already as requested',async()=>{
 for(const [syntax,patch] of [['javascript',{}],['javascript',{syntax:'javascript'}],['expression',{}],['expression',{syntax:'expression'}]]){
  const f=fixture(['A'],{syntax});await configureCalculator(f.channel,{...patch,expressions:[]});
  assert.equal(f.calls.length,0);assert.equal(f.syntax(),syntax);
 }
});
test('a language change that Loginom cannot translate is refused before any gesture',async()=>{
 const f=fixture(['A','B']);
 await assert.rejects(configureCalculator(f.channel,{syntax:'javascript',expressions:[{target:{kind:'existing',name:'A'},formula:'return 1;'}]}),/does not translate formulas/);
 assert.equal(f.calls.length,0);assert.equal(f.syntax(),'expression');
});
