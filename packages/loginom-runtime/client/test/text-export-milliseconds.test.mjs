import test from 'node:test';
import assert from 'node:assert/strict';
import {textExportParametersSchema,nodeApiTools} from '../lib/node-api.mjs';
import {validateTextExportParameters,validateNativeExportParams} from '../lib/text-export-parameters.mjs';
import {configureTextExport} from '../lib/text-export-procedure.mjs';
import {textExportReadback} from '../lib/text-export-node.mjs';
import {Page} from './support/workspace-ui-fixture.mjs';
import {userActionInventory} from '../lib/user-workflow.mjs';

const mask='hh:nn:ss.zzz',root='MF;TF-1;WizrdMCF',tid=root+';ExportTextFileParamsWizard;edtTimeFormat;ValueControl';
const parameters={destination:'/test-2/ms.csv',text_qualifier:'"',decimal_separator:'.',null_marker:'?',true_value:'True',false_value:'False',date_separator:'-',time_separator:':',date_format:'yyyy/mm/dd',time_format:'hh:mm:ss'};
const values=p=>Object.fromEntries(Object.entries(p).map(([key,value])=>[key,{value,...(key==='time_format'?{tid}:{})}]));
const binding={document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'navigation',label:'Workflow'}]},node:{document_id:'doc',workflow_id:'wf',node_id:'export'}};

test('D76 request schema advertises the millisecond mask and its native limitation',()=>{
 assert.ok(textExportParametersSchema.properties.time_format.enum.includes(mask));
 assert.match(textExportParametersSchema.properties.time_format.description,/zzz/);
 const tool=nodeApiTools.find(t=>t.name==='dock_node_apply');
 assert.match(tool.description,/negative zero as 0/);assert.match(tool.description,/midnight even with zzz/);
 assert.match(tool.description,/Warn the user/);
 const compact=userActionInventory({node_types:[{type:'exports.text',parameter_schema:textExportParametersSchema}]});
 const time=compact.node_types[0].parameter_schema.properties.time_format;
 assert.match(time.description,/native -0 to 0/);assert.match(time.description,/midnight can lose ms/);assert.match(time.description,/warn/);
});
test('D76 request and retained validators accept only the supported additional millisecond mask',()=>{
 const request={target:{kind:'existing'},inputs:[],mappings:[],read:{ports:[]}};
 assert.doesNotThrow(()=>validateTextExportParameters({time_format:mask},'delimited',request));
 assert.doesNotThrow(()=>validateNativeExportParams(values({...parameters,time_format:mask})));
 for(const time_format of ['hh:nn:ss.zzzz','unknown','hh:nn:ss.zzz\n']){
  assert.throws(()=>validateTextExportParameters({time_format},'delimited',request));
  assert.throws(()=>validateNativeExportParams(values({...parameters,time_format})));
 }
});

function fixture({retained=false,wrong=false,unrelated=false,expired=false}={}){
 let stage='text_export_params',current=values({...parameters,time_format:retained?mask:parameters.time_format});
 const actions=[],records=[],controller=new AbortController();
 const ctx={...binding,finish:'execute',signal:controller.signal,deadline:expired?0:Date.now()+60000};
 const snapshot=()=>({wizard:{stage,root_ref:'wizard',root_tid:root},ui:{elements:[
  {ref:'time',tid,allowed_actions:['set_wizard_field'],wizard_field:{name:'time_format',scope:'export_format'}},
  {ref:'done',tid:root+';btnNext',allowed_actions:['wizard_step']}
 ]}});
 const channel={observe:async()=>snapshot(),perform:async opts=>{
  const s=snapshot();assert.equal(opts.ready(s),true);const action=opts.resolve(s);actions.push(action);
  if(action.verb==='set_wizard_field'){
   assert.equal(action.ref,'time');assert.equal(action.text,mask);
   current.time_format.value=wrong?'hh:mm:ss':mask;
   if(unrelated)current.decimal_separator.value=',';
  }
 }};
 const run=()=>configureTextExport(channel,retained?{}:{time_format:mask},ctx,{operation:{id:'export'},onRecord:async e=>{records.push(e);return e},
  receiptOptions:()=>({}),execute:async code=>{
   if(code.includes('function exportNext')){stage='text_export_format';return {status:'SUCCEEDED',cleanup_complete:true,output:{existed:false}};}
   return structuredClone({verified:true,stage,values:stage==='text_export_params'?current:values({encoding:65001,delimiter:',',header:1,line_ending:0,bom:false}),node_context:binding.node});
  }});
 return {run,actions,records};
}

test('D76 custom time entry is read back before finish and survives configuration readback',async()=>{
 const f=fixture(),result=await f.run();
 assert.equal(result.configuration.configured.text_export_params.values.time_format.value,mask);
 assert.equal(f.actions.filter(a=>a.verb==='set_wizard_field').length,1);
 const readback=textExportReadback({node:binding.node,phases:[
  {phase:'input_mapping',receipt_id:'input',value:{source_identity_verified:true,native_mapping:{autosync:true,target_fields:[]}}},
  {phase:'configure',receipt_id:'configure',value:result},{phase:'finish',receipt_id:'finish',status:'verified'}
 ]});
 assert.equal(readback.settings.time_format,mask);assert.deepEqual(readback.receipt_ids,['input','configure','finish']);
});
test('D76 retained millisecond mask needs no replacement gesture',async()=>{
 const f=fixture({retained:true});await f.run();assert.equal(f.actions.filter(a=>a.verb==='set_wizard_field').length,0);
});
for(const [fault,message] of [['wrong','Export setting differs: time_format'],['unrelated','Unrequested export setting changed: decimal_separator'],['expired','deadline']])test('D76 refuses '+fault+' instead of finishing',async()=>{
 const f=fixture({[fault]:true});await assert.rejects(f.run(),new RegExp(message,'i'));
 assert.equal(f.actions.some(a=>a.verb==='wizard_step'),false);
});

test('D76 only the editable owned time-format field gains typed input alongside destination',async()=>{
 for(const fault of ['none','readonly','variable','duplicate']){
  const page=new Page(),wizard=page.add('div',root,'',{x:20,y:60,width:700,height:500}),switches=new Map();
  for(const [index,key] of ['edtFileName','edtTimeFormat','edtDateFormat'].entries()){
   const box={x:150,y:150+index*50,width:250,height:25};
   const base=root+';ExportTextFileParamsWizard;'+key,wrapper=page.add('div',base,'',box,wizard);
   const owner=page.add('div',base+';ValueControl','',box,wrapper),input=page.add('input',null,'',box,owner);
   input.value=key==='edtFileName'?'/test-2/ms.csv':'hh:mm:ss';
   if(key==='edtTimeFormat'&&fault==='readonly')input.readOnly=true;
   if(key==='edtTimeFormat'&&fault==='duplicate')page.add('input',null,'',undefined,owner).value=input.value;
   const sw=page.add('div',base+';SwitchButton','',{x:410,y:box.y,width:20,height:25},wizard);sw.id=key;
   switches.set(key,{pressed:key==='edtTimeFormat'&&fault==='variable'});
  }
  page.context.Ext={getCmp:id=>switches.get(id)};
  const s=await page.observe(),fields=s.ui.elements.filter(e=>e.allowed_actions.includes('set_wizard_field'));
  assert.equal(fields.some(e=>e.wizard_field?.name==='time_format'),fault==='none');
  assert.equal(fields.some(e=>e.wizard_field?.name==='date_format'),false);
  if(fault==='none'){
   const result=await page.act({verb:'set_wizard_field',ref:fields.find(e=>e.wizard_field.name==='time_format').ref,text:mask},s);
   assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));
   assert.equal(result.output.wizard.settings.fields.time_format.value,mask);
  }
 }
});
