import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fixture from './fixtures/output-links-settlement-native.mjs';
import {hydrate} from './fixtures/output-links-hydrate.mjs';
import {makeWorkspaceUiCode,validateUiAction} from '../lib/workspace-ui.mjs';
const executablePath=process.env.LOGINOM_FIXTURE_BROWSER;
const prepared=fixture['copy-open.json'];
const bound=fixture['pair-LKey-native-preflight.json'],unbound=fixture['pair-LKey-native-settled-unbound.json'];
const binding={document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node:{document_id:prepared.document_id,workflow_id:prepared.workflow_ref.workflow_id,node_id:bound.ledger[0].node_id}};
test('output Links require current owner-bound native settlement', {skip:!executablePath},async t=>{
 const {chromium}=createRequire(import.meta.url)('playwright');
 const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:bound.viewport});
 await context.route('**/*',r=>r.fulfill({status:200,contentType:'text/html',body:'<html><body></body></html>'}));
 const execute=(page,options)=>new Function('page',`return (${makeWorkspaceUiCode({expected_build:bound.loginom_build,expected_origin:bound.origin,prepared_node_context:binding,...options})})(page)`)(page);
 const observe=async page=>{const first=await execute(page,{mode:'observe'});assert.equal(first.status,'SUCCEEDED');const r=await execute(page,{mode:'observe',root_ref:first.output.wizard.root_ref});assert.equal(r.status,'SUCCEEDED');return r.output;};
 const linked=s=>s.ui.elements.filter(e=>e.date_time_cell?.link);
 const setup=async kind=>{const page=await context.newPage();const captured=kind==='reconnect'?unbound:bound;const evidence=fixture[kind==='reconnect'?'pair-LKey-draw-presence-settled.json':'pair-LKey-draw-presence-preflight.json'];await hydrate(page,captured,undefined,prepared,evidence.controller_pending);return page;};
 const action=(s,kind)=>{const es=linked(s);if(kind==='removal'){const e=es.filter(e=>e.date_time_cell.role==='output_relation_remove'&&e.allowed_actions.includes('click'));assert.equal(e.length,1);return {verb:'click',ref:e[0].ref};}const sources=es.filter(e=>e.date_time_cell.role==='output_source');const source=kind==='reconnect'?sources[0]:sources.find(e=>e.date_time_cell.link.selected);assert.ok(source);if(kind==='binding')return {verb:'click',ref:source.ref};const target=es.find(e=>e.date_time_cell.role==='output_target'&&e.date_time_cell.link.key===source.date_time_cell.link.key);assert.ok(target);return {verb:'drag',source_ref:source.ref,target_ref:target.ref};};
 const counter=page=>{let count=0;const method=page.mouse;for(const key of ['click','down']){const original=method[key].bind(method);method[key]=async(...args)=>{count++;return original(...args);};}return ()=>count;};
 try{
  for(const kind of ['binding','removal','reconnect'])await t.test('measured false '+kind+' includes settlement in binding/signature',async()=>{
   const page=await setup(kind),s=await observe(page);
   assert.equal(linked(s).length,kind==='reconnect'?2:14);
   for(const e of linked(s)){const proof=e.date_time_cell.link.settlement;assert.equal(proof.FLinksUpdateMode,false);assert.equal(proof.FRelationRefreshMode,false);assert.equal(proof.FWaitingRedraw,false);assert.ok(proof.controller_ref&&proof.draw_ref);assert.deepEqual(e.signature.date_time_cell.link.settlement,proof);}
   const a=action(s,kind);validateUiAction(a,s);const count=counter(page),r=await execute(page,{mode:'act',snapshot:s,action:a});assert.equal(r.status,'SUCCEEDED',JSON.stringify(r.error));assert.equal(count(),1);await page.close();
  });
  for(const flag of ['FLinksUpdateMode','FRelationRefreshMode','FWaitingRedraw'])for(const value of ['true','missing','undefined','null','number','string','object'])for(const kind of ['binding','removal','reconnect'])await t.test(flag+' '+value+' denies fresh/retained '+kind+' without DOM changes',async()=>{
   const page=await setup(kind),before=await observe(page),a=action(before,kind);validateUiAction(a,before);
   const dom=await page.content();await page.evaluate(({flag,value})=>{const {c,draw}=globalThis.__nativeFixture,owner=flag==='FWaitingRedraw'?draw:c;if(value==='missing')delete owner[flag];else owner[flag]=({true:true,undefined:undefined,null:null,number:0,string:'false',object:{value:false}})[value];},{flag,value});assert.equal(await page.content(),dom);
   const fresh=await observe(page);assert.equal(linked(fresh).length,0);assert.throws(()=>validateUiAction(a,fresh));
   const count=counter(page),r=await execute(page,{mode:'act',snapshot:before,action:a});assert.equal(r.status,'NOT_APPLIED',JSON.stringify(r));assert.equal(count(),0);await page.close();
  });
  for(const kind of ['binding','removal','reconnect'])await t.test('foreign native controller denies '+kind+' despite false flags',async()=>{
   const page=await setup(kind),before=await observe(page),a=action(before,kind);await page.evaluate(()=>{const {model}=globalThis.__nativeFixture;model.FWizardItems.FItems[0].Wizard={FLinksUpdateMode:false,FRelationRefreshMode:false};});const fresh=await observe(page);assert.equal(linked(fresh).length,0);const count=counter(page),r=await execute(page,{mode:'act',snapshot:before,action:a});assert.equal(r.status,'NOT_APPLIED');assert.equal(count(),0);await page.close();
  });
  for(const kind of ['binding','removal','reconnect'])await t.test('lost '+kind+' reply remains ambiguous with no replay',async()=>{
   const page=await setup(kind),s=await observe(page),a=action(s,kind);let count=0;const key=kind==='reconnect'?'down':'click',original=page.mouse[key].bind(page.mouse);page.mouse[key]=async(...args)=>{count++;await original(...args);throw Error('lost reply after effect');};const r=await execute(page,{mode:'act',snapshot:s,action:a});assert.equal(r.status,'AMBIGUOUS');assert.equal(count,1);await page.close();
  });
 }finally{await context.close();await browser.close();}
});
