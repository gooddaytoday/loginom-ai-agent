import test from 'node:test';
import assert from 'node:assert/strict';
import {configureGrouping} from '../lib/grouping-procedure.mjs';
import {validateUiAction} from '../lib/workspace-ui.mjs';
import {createNodeProcedure} from '../lib/node-procedure.mjs';

function fixture(fn,bit){
 const concat={separator:',',wrapper:'',unique:false,sort:false,direction:0};
 const input_fields=[{record_id:'key',name:'Region',label:'Region',type:'string',disposition:6,order:0,functions:0,concat:{...concat}},
  {record_id:'amount',name:'Amount',label:'Amount',type:'integer',disposition:7,order:0,functions:18,concat:{...concat}}];
 const native={verified:true,input_fields,keys:input_fields.slice(0,1),measures:input_fields.slice(1),selected_records:['amount'],options:{cache:true,sort:false}};
 const names=['sum','count','min','max','average','median','mode','standard_deviation','unique_count','null_count','first','last','only','concat'];
 let editor=null;const actions=[];
 const combos={separator:{tid:'W;FactorEditDialog;cntCheckboxes;fs;cbxConcatSeparator',editable:true,choices:[{value:',',label:'Запятая (,)'}]},
  wrapper:{tid:'W;FactorEditDialog;cntCheckboxes;fs;cbxConcatWrapper',editable:false,choices:[{value:'"',label:'Кавычки (")'},{value:"'",label:'Одинарные кавычки'},{value:'',label:'Без ограничителя строк'}]},
  order:{tid:'W;FactorEditDialog;cntCheckboxes;fs;fc;cbxConcatSort',editable:false,choices:[{value:'NONE',label:'Без сортировки'},{value:'ASC',label:'По возрастанию'},{value:'DESC',label:'По убыванию'}]}};
 const comboValue=key=>key==='order'?editor.concat.sort?editor.concat.direction===1?'DESC':'ASC':'NONE':editor.concat[key];
 const state=()=>({wizard:{stage:'grouping',root_tid:'W',factor_editor:editor?{status:'rendered_factor_options',selected_field:{field_key:'Amount'},
  options:names.map((aggregation,i)=>({aggregation,checked:(editor.mask&(1<<i))!==0,enabled:true,display_ref:'bit'+i}))}:undefined},
  node_grouping:{...structuredClone(native),...(editor?{factor_concat:Object.fromEntries(Object.entries(combos).map(([key,c])=>[key,{...c,value:comboValue(key)}]))}:{})},ui:{elements:[{ref:'key',grouping_field:{field_key:'Region',role:'group'},allowed_actions:['click']},{ref:'amount',grouping_field:{field_key:'Amount',role:'measure'},allowed_actions:['click','double_click']},
   ...Object.entries(combos).map(([key,c])=>({ref:key,identity:{anchor_tid:c.tid},role:'combobox',allowed_actions:['fill','press']})),
   {ref:'unique',tid:'W;FactorEditDialog;cntCheckboxes;fs;fc;chkConcatUniqueOnly;DisplayEl',check_state:{checked:editor?.concat.unique},allowed_actions:['set_checked']},
   {ref:'apply',tid:'W;FactorEditDialog;btnApply',allowed_actions:['click']}]}});
 const channel={async observe(o){const s=state();assert.ok(o.ready(s),o.condition);return s;},async perform(o){
  const s=state();assert.ok(o.ready(s),o.condition);const action=o.resolve(s);validateUiAction({...action,ref:'ui-fixture'});actions.push(action);
  if(action.verb==='click'&&['key','amount'].includes(action.ref))native.selected_records=[action.ref];
  else if(action.verb==='double_click')editor={mask:input_fields[1].functions,concat:structuredClone(input_fields[1].concat),index:0};
  else if(action.verb==='fill')editor.concat[action.ref]=action.text;
  else if(action.verb==='press'){
   const choices=combos[action.ref].choices;
   const commit=value=>{
    if(action.ref==='order'){editor.concat.sort=value!=='NONE';editor.concat.direction=value==='DESC'?1:0;}
    else editor.concat[action.ref]=value;
   };
   if(['ArrowDown','ArrowUp'].includes(action.key)){
    if(editor.popup!==action.ref){editor.popup=action.ref;editor.index=choices.findIndex(o=>o.value===comboValue(action.ref));}
    else editor.index=(editor.index+(action.key==='ArrowDown'?1:-1)+choices.length)%choices.length;
   }
   // Native trace :1602-1617: Home changes ASC to NONE, then the two
   // Down presses and Enter commit ASC. Reopening starts at the selection.
   if(action.key==='Home'){
    editor.index=0;
    if(action.ref==='order'&&comboValue('order')!==choices[0].value){commit(choices[0].value);editor.popup=null;}
   }
   if(action.key==='Enter'){commit(choices[editor.index].value);editor.popup=null;}
  }
  else if(action.ref==='unique')editor.concat.unique=action.checked;
  else if(action.verb==='set_checked'){
   const flag=1<<Number(action.ref.slice(3));editor.mask=action.checked?editor.mask|flag:editor.mask&~flag;
  }else if(action.ref==='apply'){
   input_fields[1].functions=editor.mask;input_fields[1].concat=editor.concat;editor=null;
   channel.afterApply?.(native);
  }else assert.fail('unexpected action '+JSON.stringify(action));
 }};
 return {channel,native,actions,parameters:{group_by:[{kind:'input_field',name:'Region'}],measures:[{field:{kind:'input_field',name:'Amount'},function:fn,name:'Metric',label:'Metric'}]},bit};
}
for(const [fn,bit] of [['first',1024],['last',2048],['only',4096]]){
 test(`Grouping ${fn} sets exactly its native mask and preserves unrelated settings`,async()=>{
  const f=fixture(fn,bit),before=structuredClone(f.native);
  const result=await configureGrouping(f.channel,f.parameters);
  assert.equal(result.verified,true);assert.equal(f.native.measures[0].functions,bit);
  assert.deepEqual(f.native.options,before.options);
  assert.deepEqual(f.native.input_fields.map(f=>f.concat),before.input_fields.map(f=>f.concat));
  assert.equal(f.actions.filter(a=>a.ref==='apply').length,1);
  const calls=f.actions.filter(a=>a.verb==='double_click').length;
  await configureGrouping(f.channel,f.parameters);
  assert.equal(f.actions.filter(a=>a.verb==='double_click').length,calls,'an unchanged mask needs no editor');
 });
}
test('Grouping refuses a native factor mask that did not apply',async()=>{
 const f=fixture('first',1024);f.channel.afterApply=n=>n.measures[0].functions=2;
 await assert.rejects(configureGrouping(f.channel,f.parameters),/bitset differs/);
});
test('Grouping concat changes options even when the mask is unchanged, then preserves them without mutation',async()=>{
 const f=fixture('concat',8192);
 f.native.measures[0].functions=8192;
 f.parameters.measures[0].concat={separator:'|',wrapper:'"',unique:true,order:'DESC'};
 const key=structuredClone(f.native.keys[0]);
 const result=await configureGrouping(f.channel,f.parameters);
 assert.equal(result.preservation.concat_options,false);
 assert.deepEqual(f.native.measures[0].concat,{separator:'|',wrapper:'"',unique:true,sort:true,direction:1});
 assert.deepEqual(f.native.keys[0],key);
 for(const order of ['ASC','none']){
  f.parameters.measures[0].concat.order=order;
  await configureGrouping(f.channel,f.parameters);
  assert.equal(f.native.measures[0].concat.sort,order!=='none');
  if(order==='ASC')assert.equal(f.native.measures[0].concat.direction,0);
 }
 const calls=f.actions.filter(a=>a.verb==='double_click').length;
 await configureGrouping(f.channel,f.parameters);
 await configureGrouping(f.channel,{});
 assert.equal(f.actions.filter(a=>a.verb==='double_click').length,calls);
});
test('Grouping concat refuses incorrect native settings after Apply',async()=>{
 const f=fixture('concat',8192);f.parameters.measures[0].concat={separator:'|',wrapper:'',unique:false,order:'none'};
 f.channel.afterApply=n=>n.measures[0].concat.separator=',';
 await assert.rejects(configureGrouping(f.channel,f.parameters),/concat settings differ/);
});
for(const combo of ['cbxConcatSeparator','cbxConcatWrapper','fc;cbxConcatSort'])for(const fault of ['none','foreign','dialog','selection']){
 test(`Grouping concat keeps its factor editor when ${combo} opens: ${fault}`,async()=>{
  const workflow_ref={workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'Scenario'}]};
  const base=workflow_ref.prefix+';WizrdMCF',tid=base+';FactorEditDialog',node={document_id:'doc',workflow_id:'wf',node_id:'group'};
  const owner={...node,verified:true,surface:'wizard',tid:base},portal=(fault==='foreign'?base+';Foreign':tid+';cntCheckboxes;fs;'+combo)+';boundlist';
  const state={origin:'http://example.test',loginom_build:'7.4.2',workflow_ref,dom_epoch:{document:'dom',revision:1},prepared_node_context:owner,scan:{complete:true},
   wizard:{status:'observed',stage:'grouping',root_tid:base,root_ref:'wizard',factor_editor:{status:'rendered_factor_options',dialog_ref:'factor',selected_field:{status:fault==='selection'?'unobserved':'rendered_selected',field_key:'Amount'}}},
   ui:{elements:[{tid,ref:'factor'},{tid:portal,ref:'choices'}],dialogs:[{ref:'factor',identity:{anchor_tid:fault==='dialog'?'Other;FactorEditDialog':tid}}],masks:[],truncated:{dialogs:false,masks:false}}};
  const roots=[];let clock=1;
  const channel=createNodeProcedure({operation:{id:'concat',deadline:10000,action:{action_key:'node.apply',revision:'1'}},
   preparedNodeContext:{document_id:'doc',workflow_ref,node},targetOrigin:state.origin,targetBuild:state.loginom_build,
   now:()=>clock++,wait:async()=>{clock+=1000},record:async e=>structuredClone(e),execute:async code=>{
    if(code.includes('function readGroupingBrowser'))return {verified:true,node_context:owner};
    const s=structuredClone(state);
    if(!code.includes('"discover_roots":true')){
     const root=/"root_ref":"([^"]+)"/.exec(code)?.[1];roots.push(root);
     if(root!=='factor')s.wizard.factor_editor.status='unobserved';
    }
    return {status:'SUCCEEDED',output:s};
   }});
  const read=()=>channel.observe({condition:'owned concat popup',readGrouping:true,ready:s=>s.node_grouping?.verified===true,timeoutMs:2000});
  if(fault==='none'){await read();await channel.observe({condition:'fresh concat precondition',ready:s=>s.wizard.factor_editor.status==='rendered_factor_options',timeoutMs:2000});assert.ok(roots.length&&roots.every(r=>r==='factor'));}
  else await assert.rejects(read(),/blocked by a mask or dialog/);
 });
}

for(const from of ['none','ASC','DESC'])for(const to of ['none','ASC','DESC'])test(`Grouping concat order ${from} -> ${to} starts from the observed native selection`,async()=>{
 const f=fixture('concat',8192);f.native.measures[0].functions=8192;
 f.native.measures[0].concat={separator:'|',wrapper:'',unique:false,sort:from!=='none',direction:from==='DESC'?1:0};
 f.parameters.measures[0].concat={separator:'|',wrapper:'',unique:false,order:to};
 await configureGrouping(f.channel,f.parameters);
 assert.equal(f.native.measures[0].concat.sort,to!=='none');
 if(to!=='none')assert.equal(f.native.measures[0].concat.direction,to==='DESC'?1:0);
});
