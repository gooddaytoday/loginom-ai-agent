import test from 'node:test';import assert from 'node:assert/strict';
import {configureReplacement} from '../lib/replacement-procedure.mjs';
import {createNodeProcedure} from '../lib/node-procedure.mjs';
const changes={unchanged:s=>{},value:s=>s.node_replacement.editor_values.from=valueForChange('Null'),row:s=>s.node_replacement.editor_record_id='foreign',field:s=>s.node_replacement.selected='Other',owner:s=>s.node_replacement.node_context.node_id='foreign',input:s=>s.node_replacement.input_fields[0].record_id='new',button:s=>s.ui.elements.at(-1).replacement_field.record_id='new'};
const valueForChange=value=>({type:'string',value});
for(const [name,change] of Object.entries(changes))test('commit recovery validates '+name+' before Update',async()=>{
// Capture the actual commit options produced by configureReplacement, without
// executing its commit or opening any browser/server resource.
const value=v=>({type:'string',value:v});
const pair={from:value(null),to:value('Missing')};
const rule={field:{kind:'input_field',name:'Category'},type:'string',case_sensitive:true,pairs:[pair],other:{mode:'keep'}};
const binding={document_id:'doc',workflow_ref:{workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Scenario',label:'Scenario'}]},node:{document_id:'doc',workflow_id:'flow',node_id:'node'}};
const owner={verified:true,...binding.node,surface:'wizard',locked:false};
const state={origin:'http://example.test',loginom_build:'7.4.2',workflow_ref:binding.workflow_ref,dom_epoch:{document:'dom',revision:1},prepared_node_context:owner,scan:{complete:true},wizard:{status:'observed',stage:'replacement',root_tid:'w',root_ref:'root'},node_replacement:{verified:true,node_context:owner,selected:'Category',input_fields:[{record_id:'f',name:'Category',label:'Category',type:'string',mode:'none'}],pairs:[],other:{mode:'keep'},case_sensitive:true,precision:0,editor_open:false,editor_record_id:'p',editor_values:{from:value(''),to:value('')}},ui:{masks:[],dialogs:[],truncated:{elements:false,masks:false,dialogs:false},elements:[]}};
const element=(ref,tid,allowed_actions,extra={})=>({ref:'ui-'+ref,tid,allowed_actions,...extra});
state.ui.elements=[
 element('mode','mode',['click'],{replacement_field:{field_key:'Category',role:'field',part:'mode',record_id:'f'}}),
 element('manual','w;ReplaceColumnsWizard;grdDataList;tbl;celleditor;cbx;boundlist;Ввод_вручную',['click']),
 element('add','w;ReplaceColumnsWizard;grdReplaceItems;tbl;GroupHeader;0;AddButton',['click']),
 element('from','from',['click','double_click'],{replacement_field:{field_key:'Category',role:'pair',part:'from',record_id:'p'}}),
 element('set-null','w;ReplaceColumnsWizard;ReplaceEditor;fldVariant;ValueContainer;txt;trg_SetNullTrigger',['click']),
 element('to','w;ReplaceColumnsWizard;ReplaceEditor-1;fldVariant;ValueContainer;txt',['fill']),
 element('update','roweditorbuttons;update',['click'],{replacement_field:{field_key:'Category',record_id:'f',selected_record_id:'f',role:'control',part:'update',wizard_root_ref:'root'}})
];
let commit;
const sentinel=Error('commit captured');
await assert.rejects(()=>configureReplacement({
 observe:async o=>{assert.ok(o.ready(state),o.condition);return structuredClone(state);},
 perform:async o=>{
  if(o.condition==='commit replacement row'){commit=o;throw sentinel;}
  const a=o.resolve(state),r=state.node_replacement;
  if(a.ref==='ui-manual')r.input_fields[0].mode='manual';
  if(a.ref==='ui-add')r.pairs.push({record_id:'p',from:value(''),to:value('')});
  if(a.ref==='ui-from')r.editor_open=true;
  if(a.ref==='ui-set-null')r.editor_values.from=value(null);
  if(a.ref==='ui-to')r.editor_values.to=value(a.text);
 }
},{rules:[rule],output_mode:'replace'}),e=>e===sentinel);
assert.ok(commit);

// Exercise the production node-procedure perform implementation, including its
// durable NOT_APPLIED/UI_EPOCH_CHANGED recovery and native re-observation.
const events=[];let attempts=0;const gestures=[];
const channel=createNodeProcedure({operation:{id:'probe',deadline:10000,action:{action_key:'node.apply',revision:'1'}},preparedNodeContext:binding,targetOrigin:state.origin,targetBuild:state.loginom_build,now:()=>1,wait:async()=>{},record:async e=>{events.push(structuredClone(e));return structuredClone(e);},wrapMutation:(code,options)=>({code,options}),execute:async code=>{
 if(typeof code==='string'){
  if(code.includes('function workspaceUiCapability'))return {status:'SUCCEEDED',output:structuredClone(state)};
  return structuredClone(state.node_replacement);
 }
 attempts++;
 if(attempts===1){
  change(state);state.dom_epoch.revision++;
  return {operation_id:code.options.id,action_key:'ui.act',status:'NOT_APPLIED',phase:'preconditions',cleanup_complete:true,effect_possible:false,error:{code:'UI_EPOCH_CHANGED'},trace:[]};
 }
 gestures.push({action:events.filter(e=>e.phase==='node_step_prepared').at(-1).action,editor_values:structuredClone(state.node_replacement.editor_values)});
 return {operation_id:code.options.id,action_key:'ui.act',status:'SUCCEEDED',phase:'completed',cleanup_complete:true,effect_possible:true,trace:[]};
}});
const initial=await channel.observe({condition:'initial native editor',readReplacement:true,ready:commit.ready});
if(name==='unchanged'){
 const receipt=await channel.perform({...commit,initialObservation:initial});assert.equal(receipt.status,'SUCCEEDED');assert.equal(attempts,2);assert.equal(gestures.length,1);
}else{
 await assert.rejects(()=>channel.perform({...commit,initialObservation:initial}),/Replacement (native editor value|commit editor binding|commit input type|row update unavailable) differs|Replacement row update unavailable|Prepared node binding is missing or changed/);
 assert.equal(attempts,1);assert.equal(gestures.length,0);
}
assert.equal(events.filter(e=>e.phase==='node_step_refresh_authorized').length,1);
});
