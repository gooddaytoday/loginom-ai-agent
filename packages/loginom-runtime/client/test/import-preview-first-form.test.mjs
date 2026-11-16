import test from 'node:test';
import assert from 'node:assert/strict';
import {createTextImportNodeSupport,previewImportFirstFormRefusal} from '../lib/text-import-node.mjs';

// LAB-1735: after a preview_only Close the model reused the node without
// decimal_separator; the wizard default «Не задано (,)» failed only after open.
const node={document_id:'d',workflow_id:'w',node_id:'n'};
const preview={sequence:0,request:{document_id:'d',finish:'close',target:{kind:'new',type:'imports.text'},
 parameters:{preview_only:true,source:{kind:'verified_delivery',artifact_id:'a',upload_operation_id:'u'},settings:{source:{}}}},
 outcome:{status:'SUCCEEDED',output:{node,configuration:{status:'discarded'},server_profile:{}}},cleanup_confirmed:true};
const settings={source:{encoding:'UTF-8',rows_to_skip:0,first_line_as_title:true},
 format:{delimiter:';',decimal_separator:'.',null_marker:'\\N',text_qualifier:'"',auto_detect_columns:'none'},
 columns:[{source_name:'RowID',type:'integer'}]};
const request=s=>({document_id:'d',finish:'execute',target:{kind:'existing',type:'imports.text',ref:node},
 parameters:{source:preview.request.parameters.source,settings:s},inputs:[],mappings:[],read:{ports:[0]}});
const without=(path)=>{const s=structuredClone(settings),[group,key]=path.split('.');delete s[group][key];return s;};

test('first form of a previewed import names every missing field and allowed values before the wizard opens',()=>{
 const message=previewImportFirstFormRefusal(request(without('format.decimal_separator')),[preview]);
 assert.match(message,/Missing: settings\.format\.decimal_separator\./);
 assert.match(message,/decimal_separator "\." or ","/);
 assert.doesNotMatch(message,/explicit source_path/);
 const all=previewImportFirstFormRefusal(request({format:{delimiter:';'}}),[preview]);
 assert.match(all,/Missing: settings\.source\.encoding, settings\.source\.rows_to_skip, settings\.source\.first_line_as_title, settings\.format\.decimal_separator, settings\.columns\./);
 assert.equal(previewImportFirstFormRefusal(request(settings),[preview]),null);
 assert.equal(previewImportFirstFormRefusal(request({...without('format.decimal_separator'),format:{decimal_separator:','}}),[preview]),null,'omitted delimiter etc. keep native defaults');
 const auto=structuredClone(settings);delete auto.columns;auto.format.auto_detect_columns='new';
 assert.equal(previewImportFirstFormRefusal(request(auto),[preview]),null);
});

test('only an import whose every operation is the discarded preview gets the first-form check',()=>{
 const patch=request({format:{delimiter:','}});
 assert.equal(previewImportFirstFormRefusal(patch,[]),null,'unknown node: existing patch semantics');
 const saved={...preview,sequence:1,request:{document_id:'d',finish:'done',target:{kind:'existing',type:'imports.text',ref:node},parameters:{settings:{}}},
  outcome:{status:'SUCCEEDED',output:{node,configuration:{status:'applied'}}}};
 assert.equal(previewImportFirstFormRefusal(patch,[preview,saved]),null,'a saved configuration keeps patch semantics');
 const failed={...saved,outcome:{status:'FAILED',output:{node}}};
 assert.equal(previewImportFirstFormRefusal(patch,[preview,failed]),null,'uncertain state keeps the existing late check');
 const rejected={...saved,outcome:{status:'NOT_APPLIED',output:{}}};
 assert.ok(previewImportFirstFormRefusal(patch,[preview,rejected]));
 assert.equal(previewImportFirstFormRefusal({...patch,target:{...patch.target,ref:{...node,node_id:'other'}}},[preview]),null);
 assert.equal(previewImportFirstFormRefusal({...patch,document_id:'other'},[preview]),null);
 const storage={...preview,request:{...preview.request,parameters:{...preview.request.parameters,source:{kind:'storage',server_source_ref:'s'}}}};
 assert.ok(previewImportFirstFormRefusal(patch,[storage]));
});

test('source phase refuses the incomplete first form as NOT_APPLIED without browser work or storage navigation',async()=>{
 const r=request(without('format.decimal_separator'));
 let browser=0,storage=0;
 const operation={id:'import',parameters:r,nodeApply:{request:r}};
 const driver=createTextImportNodeSupport({}).nodeApplyDriverFactory({operation,onRecord:()=>{},now:Date.now,receiptOptions:()=>({}),
  execute:async()=>{browser++;},resolveStorageSource:async()=>{storage++;},verifiedUploads:()=>[],nodeHistory:()=>[preview]});
 await assert.rejects(driver.verifySource(r.parameters),error=>{
  assert.match(error.message,/settings\.format\.decimal_separator/);
  assert.deepEqual(error.nodePhaseRefusal,{phase:'source',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true});
  return true;
 });
 assert.equal(browser+storage,0);
});
