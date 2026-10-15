import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {captureWindowDiagnostic,validateCapture} from '../src/acceptance/calculator-grouped-before-done-v1.mjs';
const factual=JSON.parse(await readFile(new URL('./fixtures/calculator-cached-windows-b7e68c0d.json',import.meta.url),'utf8'));
const contract=JSON.parse(await readFile(new URL('./fixtures/calculator-store-contract-5.1.2.json',import.meta.url),'utf8'));
// Saved window evidence is native. The identity/DOM/record envelope below is an
// explicit double solely to reach the unchanged production window validator.
const owner={document_id:'contract-double'},context={root_tid:'root',root_ref:'root-ref',region:{record_id:'Region'}};
const capture=windows=>({owner,root_tid:context.root_tid,root_ref:context.root_ref,dom:[],stores:[{records:[]},{records:[{internalId:'Region',data:{Name:'Region'}}]}],collector_revision:1,predicates:{status:'partial',evaluated:false,cached_windows:windows}});
test('actual saved b7 missing-bit evidence remains an unchanged strict refusal',()=>{
 const c=capture(structuredClone(factual.windows));assert.deepEqual(captureWindowDiagnostic(c),factual);
 assert.throws(()=>validateCapture(c,owner,context),/LOGINOM_CAPTURE_CACHED_WINDOW/);
 for(const w of c.predicates.cached_windows){assert.equal(w.evaluated,false);assert.equal(w.value,null);assert.equal(w.isBufferedStore_descriptor.own_value,null);assert.equal(w.isBufferedStore_descriptor.inherited_value,null)}
});
test('inspected native framework contract has only the positive BufferedStore tag',()=>{
 for(const name of ['Ext.data.Store','Ext.data.ProxyStore','Ext.data.AbstractStore','Ext.data.LocalStore']){
  const d=contract.observed_definitions.find(d=>d.class_name===name);assert.ok(d);assert.deepEqual(d.isBufferedStore,{type:'absent'});assert.equal(d.config_isBufferedStore,false);assert.equal(d.getIsBufferedStore_present,false);
 }
 assert.deepEqual(contract.isBufferedStore_data_declarations.map(d=>({type:d.type,value:d.value})),[{type:'boolean',value:true}]);
 const buffered=contract.observed_definitions.find(d=>d.class_name==='Ext.data.BufferedStore');assert.deepEqual(buffered.isBufferedStore,{type:'boolean',value:true});
});
for(const alternative of ['class-name','buffered-default','proxy-paging-disabled','matching-counts'])test('unaccepted '+alternative+' evidence cannot replace the missing native bit',()=>{
 const windows=structuredClone(factual.windows);
 for(const w of windows){
  if(alternative==='class-name')w.store_provenance.$className={type:'string',value:'Ext.data.Store'};
  if(alternative==='buffered-default')w.store_provenance.descriptors.buffered={own:'data',own_type:'boolean',own_value:false};
  if(alternative==='proxy-paging-disabled')w.proposed_proxy_evidence={enablePaging:false};
  if(alternative==='matching-counts')w.proposed_collection_evidence={cached:true,count:6,store_count:6,all_members_equal:true};
 }
 assert.throws(()=>validateCapture(capture(windows),owner,context),/LOGINOM_CAPTURE_CACHED_WINDOW/);
});
