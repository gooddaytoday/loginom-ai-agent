import test from 'node:test';
import assert from 'node:assert/strict';
import {textExportParametersSchema} from '../lib/node-api.mjs';
import {validateTextExportParameters,validateNativeExportFormat,nativeExportValue} from '../lib/text-export-parameters.mjs';
import {configureTextExport} from '../lib/text-export-procedure.mjs';

const root='MF;TF-1;WizrdMCF',tid=root+';ExportTextFilePreviewWizard;edtCodePage;ValueControl';
const binding={document_id:'doc',workflow_ref:{workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'scenario',label:'Scenario'}]},node:{document_id:'doc',workflow_id:'flow',node_id:'export'}};
const values=(encoding,bom=false)=>Object.fromEntries(Object.entries({encoding,delimiter:';',header:2,line_ending:1,bom}).map(([k,value])=>[k,{value,...(k==='encoding'?{tid}:{})}]));

test('Windows-1251 request, inventory schema and retained native code page agree',()=>{
 assert.deepEqual(textExportParametersSchema.properties.encoding.enum,['UTF-8','Windows-1251']);
 const request={target:{kind:'existing'},read:{ports:[]},inputs:[],mappings:[]};
 for(const [encoding,code] of [['UTF-8',65001],['Windows-1251',1251]]){
  assert.doesNotThrow(()=>validateTextExportParameters({encoding},'delimited',request));
  assert.equal(nativeExportValue('encoding',encoding),code);
  for(const bom of [false,true])assert.doesNotThrow(()=>validateNativeExportFormat(values(code,bom)));
 }
 for(const encoding of ['CP1251','ANSI','Windows-1252',1251])assert.throws(()=>validateTextExportParameters({encoding},'delimited',request));
 for(const code of [1252,1200,'1251'])assert.throws(()=>validateNativeExportFormat(values(code)));
});

function fixture(initial,encoding,{wrong=false,unrelated=false}={}){
 let stage='text_export_params',code=initial,opened=false;
 const actions=[];
 const snapshot=()=>({wizard:{stage,root_tid:root,root_ref:'wizard'},ui:{elements:[
  {ref:'picker',tid:tid+';trg_picker',allowed_actions:['click'],interaction:{state:'point_observed'},wizard_combo:{field:{name:'encoding',value:code}}},
  ...(opened?[{ref:'cp',tid:tid+';boundlist;1251',label:'Кириллическая (1251)',allowed_actions:['select_wizard_option']},
   {ref:'utf',tid:tid+';boundlist;65001',label:'UTF-8 (65001)',allowed_actions:['select_wizard_option']}]:[]),
  {ref:'done',tid:root+';btnNext',allowed_actions:['wizard_step']}
 ]}});
 const native=()=>({verified:true,stage,values:stage==='text_export_params'?{destination:{value:'/test-2/cp1251.csv'}}:{...values(code),...(unrelated&&actions.some(a=>a.verb==='select_wizard_option')?{delimiter:{value:','}}:{})}});
 const channel={observe:async opts=>{const s=snapshot();assert.equal(opts.ready(s),true);return s;},perform:async opts=>{
  const s=snapshot();assert.equal(opts.ready(s),true);const a=opts.resolve(s);actions.push(a);
  if(a.verb==='click')opened=true;
  if(a.verb==='select_wizard_option'&&!wrong)code=a.ref==='cp'?1251:65001;
 }};
 return {actions,run:()=>configureTextExport(channel,{encoding},{...binding,finish:'close',deadline:Date.now()+60000},
  {operation:{id:'encoding'},onRecord:async e=>e,receiptOptions:()=>({}),execute:async source=>{
   if(source.includes('function exportNext')){stage='text_export_format';return {status:'SUCCEEDED',cleanup_complete:true,output:{existed:false}};}
   return native();
  }})};
}

test('production export config selects CP1251 and switches the same node back to UTF-8',async()=>{
 for(const [initial,encoding,ref,code] of [[65001,'Windows-1251','cp',1251],[1251,'UTF-8','utf',65001]]){
  const f=fixture(initial,encoding),r=await f.run();
  assert.equal(r.configuration.configured.text_export_format.values.encoding.value,code);
  assert.deepEqual(f.actions.map(a=>a.verb),['click','select_wizard_option']);
  assert.equal(f.actions[1].ref,ref);
 }
 const retained=fixture(1251,'Windows-1251');await retained.run();assert.deepEqual(retained.actions,[]);
});
for(const [fault,message] of [['wrong','Export setting differs: encoding'],['unrelated','Unrequested export setting changed: delimiter']])test('encoding change refuses '+fault+' native readback',async()=>{
 const f=fixture(65001,'Windows-1251',{[fault]:true});await assert.rejects(f.run(),new RegExp(message));
});
