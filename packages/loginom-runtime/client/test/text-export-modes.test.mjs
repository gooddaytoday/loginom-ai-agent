import test from 'node:test';
import assert from 'node:assert/strict';
import {validateTextExportParameters,nativeExportValue,validateNativeExportFormat,validateExportDestination} from '../lib/text-export-parameters.mjs';
import {textExportParametersSchema} from '../lib/node-api.mjs';
import {configureTextExport} from '../lib/text-export-procedure.mjs';
import {requireStorageDestination} from '../lib/storage-policy.mjs';
import {readTextExportBrowser} from '../lib/text-export-context.mjs';
import {chromium} from 'playwright-core';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {nodeApplyResultSchema} from '../lib/node-result-schema.mjs';
import {textExportReadback} from '../lib/text-export-node.mjs';

const encodings=[['Windows-1252',1252,'Западноевропейская (1252)'],['UTF-16 LE',1200,'UTF-16 LE (1200)'],['UTF-16 BE',1201,'UTF-16 BE (1201)']];
test('fixed width and explicit Unicode/western encodings reach production preflight',()=>{
 const request={target:{kind:'existing'},read:{ports:[]},inputs:[],mappings:[]};
 for(const [encoding,code] of encodings){
  assert.ok(textExportParametersSchema.properties.encoding.enum.includes(encoding));
  assert.doesNotThrow(()=>validateTextExportParameters({encoding},'fixed_width',request));
  assert.equal(nativeExportValue('encoding',encoding),code);
  assert.doesNotThrow(()=>validateNativeExportFormat(Object.fromEntries(Object.entries({encoding:code,delimiter:';',header:1,line_ending:1,bom:true}).map(([k,value])=>[k,{value}]))));
 }
 assert.equal(validateExportDestination('/test-2/fixed.txt'),'/test-2/fixed.txt');
 assert.equal(requireStorageDestination('/own/fixed.txt',{packages:'/own',inputs:'/own',exports:'/own'},'exports'),'/own/fixed.txt');
 for(const mode of ['fixed','manual_width'])assert.throws(()=>validateTextExportParameters({},mode,request));
 for(const encoding of ['ANSI','ASCII','UTF-16','CP1252'])assert.throws(()=>validateTextExportParameters({encoding},'delimited',request));
});

const root='MF;TF-1;WizrdMCF',base=root+';ExportTextFilePreviewWizard;';
const binding={document_id:'doc',workflow_ref:{workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'scenario',label:'Scenario'}]},node:{document_id:'doc',workflow_id:'flow',node_id:'export'}};
test('actual export readback validates for both representations and every registered encoding',()=>{
 const validate=new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema);
 for(const format of ['delimited','fixed_width'])for(const encoding of [65001,1251,1252,1200,1201]){
  const settings={destination:'/test-2/fixed.txt',text_qualifier:'"',decimal_separator:'.',date_separator:'',time_separator:'',true_value:'True',false_value:'False',null_marker:'',date_format:'',time_format:'',delimiter:';',encoding,bom:false,line_ending:1,header:1};
  const readback=textExportReadback({node:binding.node,phases:[
   {phase:'input_mapping',receipt_id:'input',value:{source_identity_verified:true,native_mapping:{autosync:true,target_fields:[]}}},
   {phase:'configure',receipt_id:'configure',value:{configuration:{destination:settings.destination,configured:{text_export_format:{format,values:Object.fromEntries(Object.entries(settings).map(([k,value])=>[k,{value}]))}}}}},
   {phase:'finish',receipt_id:'finish',status:'verified'}
  ]});
  const result={operation_id:'export',status:'SUCCEEDED',effect_possible:true,phases:[],node:binding.node,execution:{status:'not_requested',execution_id:null},output:{status:'not_refreshed',evidence_ref:null,ports:[]},package_saved:false,cleanup_complete:true,warnings:[],configuration:{status:'applied',readback}};
  assert.equal(validate(result).valid,true,format+' / '+encoding);
  delete readback.format;assert.equal(validate(result).valid,true,'legacy readbacks remain valid');
 }
});
function fixture({initial='delimited',mode='fixed_width',encoding,bomRequested,initialBom=false,wrong=false,unrelated=false}={}){
 let stage='text_export_params',format=initial,code=65001,opened=false,bom=initialBom;
 const actions=[];
 const tid=base+'edtCodePage;ValueControl';
 const snapshot=()=>({wizard:{stage,root_tid:root,root_ref:'wizard'},ui:{elements:[
  {ref:'bom',tid:base+'edtWriteBOM;ValueControl;DisplayEl',allowed_actions:['set_checked']},
  ...['delimited','fixed_width'].map((mode,i)=>({ref:mode,tid:base+'edtFormatType;ValueControl;radiofield'+(i?'-1':'')+';DisplayEl',allowed_actions:['set_checked'],check_state:{kind:'radio',checked:format===mode}})),
  {ref:'picker',tid:tid+';trg_picker',allowed_actions:['click'],interaction:{state:'point_observed'},wizard_combo:{field:{name:'encoding',value:code}}},
  ...(opened?encodings.map(([name,value,label])=>({ref:name,tid:tid+';boundlist;'+value,label,allowed_actions:['select_wizard_option']})):[])
 ]}});
 const native=()=>({verified:true,stage,format,values:stage==='text_export_params'?{destination:{value:'/test-2/fixed.txt'}}:{encoding:{value:code,tid},bom:{value:bom,tid:base+'edtWriteBOM;ValueControl'},delimiter:{value:unrelated&&actions.length?',':';'}}});
 const channel={observe:async o=>{const s=snapshot();assert.ok(o.ready(s));return s;},perform:async o=>{
  const s=snapshot();assert.ok(o.ready(s));const a=o.resolve(s);actions.push(a);
  if(a.verb==='set_checked'&&a.ref==='bom')bom=a.checked;
  else if(a.verb==='set_checked'){assert.equal(a.checked,true);if(!wrong)format=a.ref;}
  if(a.verb==='click')opened=true;
  if(a.verb==='select_wizard_option'&&!wrong){code=encodings.find(e=>e[0]===a.ref)[1];if([1200,1201].includes(code))bom=true;}
 }};
 return {actions,run:()=>configureTextExport(channel,{...(bomRequested!==undefined?{bom:bomRequested}:{}),...(encoding?{encoding}:{}),delimiter:';'},{...binding,mode,finish:'close',deadline:Date.now()+60000},{operation:{id:'mode'},onRecord:async e=>e,receiptOptions:()=>({}),execute:async source=>{
  if(source.includes('function exportNext')){stage='text_export_format';return {status:'SUCCEEDED',cleanup_complete:true,output:{existed:false}};}
  return native();
 }})};
}
test('production writer selects native width radio, preserves delimiter, and reverses mode',async()=>{
 for(const [initial,mode] of [['delimited','fixed_width'],['fixed_width','delimited']]){
  const f=fixture({initial,mode}),result=await f.run();
  assert.equal(result.configuration.configured.text_export_format.format,mode);
  assert.deepEqual(f.actions,[{verb:'set_checked',ref:mode,checked:true}]);
 }
 const retained=fixture({initial:'fixed_width'});await retained.run();assert.deepEqual(retained.actions,[]);
});
test('production writer chooses all three observed encoding labels',async()=>{
 for(const [encoding,code] of encodings){
  const f=fixture({encoding}),result=await f.run();
  assert.equal(result.configuration.configured.text_export_format.values.encoding.value,code);
  assert.ok(f.actions.some(a=>a.verb==='select_wizard_option'&&a.ref===encoding));
  assert.equal(result.configuration.configured.text_export_format.values.bom.value,false);
 }
});
test('mode selection refuses wrong or collateral native changes',async()=>{
 await assert.rejects(fixture({wrong:true}).run(),/format differs/);
 await assert.rejects(fixture({unrelated:true}).run(),/Unrequested export setting changed: delimiter/);
 await assert.rejects(fixture({mode:'delimited',encoding:'UTF-16 LE',unrelated:true}).run(),/Unrequested export setting changed: delimiter/);
});

test('native DOM reader distinguishes both format radios and refuses variable/unknown formats',async t=>{
 const browser=await chromium.launch({executablePath:process.env.LOGINOM_DOCK_TEST_BROWSER,headless:true,args:['--no-proxy-server']});
 t.after(()=>browser.close());const page=await browser.newPage();
 await page.setContent('<div data-tid="MF;TF-1;WizrdMCF;ExportTextFilePreviewWizard"><div id="mode" data-tid="MF;TF-1;WizrdMCF;ExportTextFilePreviewWizard;edtFormatType;ValueControl"></div><div id="switch" data-tid="MF;TF-1;WizrdMCF;ExportTextFilePreviewWizard;edtFormatType;SwitchButton"></div></div>');
 for(const [value,pressed,format] of [[{format:0},false,'delimited'],[{format:1},false,'fixed_width'],[{format:2},false,null],[{format:1},true,null],[{format:1,other:0},false,null],[1,false,null]]){
  await page.evaluate(({value,pressed})=>{globalThis.Ext={getCmp:id=>({el:{dom:document.getElementById(id)},getValue:()=>value,pressed})};},{value,pressed});
  const result=await page.evaluate(readTextExportBrowser,{prefix:'MF;TF-1',fields:{}});
  assert.equal(result.verified,format!==null);if(format)assert.equal(result.format,format);
 }
});

test('native UTF-16 BOM default honors true/false and preserves omitted patch BOM',async()=>{
 for(const encoding of ['UTF-16 LE','UTF-16 BE'])for(const initialBom of [false,true])for(const bomRequested of [undefined,false,true]){
  const f=fixture({mode:'delimited',encoding,initialBom,bomRequested}),r=await f.run();
  assert.equal(r.configuration.configured.text_export_format.values.bom.value,bomRequested??initialBom);
  assert.equal(f.actions.filter(a=>a.ref==='bom').length,(bomRequested??initialBom)?0:1);
 }
});
