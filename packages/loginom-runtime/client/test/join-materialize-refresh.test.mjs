// Offline counterfactuals on measured captures. No Loginom requests or live context.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const client=path.resolve(new URL('..',import.meta.url).pathname), output=process.env.LOGINOM_REFRESH_EVIDENCE?path.resolve(process.env.LOGINOM_REFRESH_EVIDENCE):await fs.mkdtemp(path.join(os.tmpdir(),'join-refresh-')); 
const loadModule=n=>import(pathToFileURL(path.join(client,n)));
const {default:fixture}=await loadModule('test/fixtures/join-materialize-native.mjs');
const {hydrate}=await loadModule('test/fixtures/output-links-hydrate.mjs');
const {configureJoinOutput}=await loadModule('lib/join-mappings.mjs');
const {createNodeProcedure}=await loadModule('lib/node-procedure.mjs');
const {withBrowserReceipt}=await loadModule('lib/executor.mjs');
const config=JSON.parse(await fs.readFile(path.join(client,'test/fixtures/join-source-fetch-native.json')));
const {chromium}=createRequire(import.meta.url)('playwright');
const captured=fixture['pair-LKey-native-preflight.json'].native,prepared=fixture.prepared;
const binding={document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node:{document_id:prepared.document_id,workflow_id:prepared.workflow_ref.workflow_id,node_id:captured.ledger[0].node_id}};
await fs.mkdir(output,{recursive:true});

for(const variant of ['unchanged','stale_unbound_label','stale_unbound_type','changed_retained_origin'])test('Join materializer bounded epoch refresh: '+variant,async()=>{
 const browser=await chromium.launch({executablePath:process.env.LOGINOM_FIXTURE_BROWSER,headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:captured.viewport});
 let requests=0;await context.route('**/*',r=>{requests++;return r.fulfill({status:200,contentType:'text/html',body:'<html><body></body></html>'});});
 const page=await context.newPage(),journal=[],receipts=[],dispatches=[];let loaded=false,injected=false,stop=false;
 let currentAction=null,lastObservation=null;
 for(const method of ['click','down']){const original=page.mouse[method].bind(page.mouse);page.mouse[method]=async(...args)=>{dispatches.push({method,action:structuredClone(currentAction)});return original(...args);};}
 const load=async key=>{
  const d=fixture[key];await hydrate(page,d.native,loaded?'transition':undefined,prepared,d.settlement);loaded=true;
  await page.evaluate(pressed=>{const e=[...document.querySelectorAll('[data-tid]')].find(e=>e.getAttribute('data-tid').endsWith(';btnAutoSyncThroughColumns'));Ext.getCmp(e.id).pressed=pressed;
   for(const input of document.querySelectorAll('input.x-form-radio')){const display=input.nextElementSibling;if(display?.tagName==='SPAN')input.parentElement.append(input,display);}},d.autosync_receipt.value);
 };
 const operation={id:'independent-refresh-'+variant,action:{action_key:'node.apply',revision:'1'},deadline:Date.now()+60000};
 let error=null;
 try{
  await load('pair-LKey-native-preflight.json');
  const execute=async code=>{
   if(stop)throw Error('DIAGNOSTIC_STOP_AFTER_COMPLETED_FIRST_RECONNECT');
   if(typeof code==='string')return new Function('page',`return (${code})(page)`)(page);
   currentAction=journal.findLast(e=>e.phase==='node_step_prepared')?.action;
   if(currentAction?.verb==='drag'&&!injected){
    injected=true;
    await page.evaluate(v=>{const {get,grids}=__nativeFixture;
     document.querySelector('[data-tid$=";WizrdMCF"]').setAttribute('data-independent-epoch','changed');
     if(v==='stale_unbound_label')get(grids[1].records[0].object).data.SourceDisplayName='foreign';
     if(v==='stale_unbound_type')get(grids[1].records[0].object).data.SourceDataType=5;
     if(v==='changed_retained_origin')get(grids[1].records[1].object).data.OriginType=1;
    },variant);
   }
   const count=dispatches.length;
   const result=await new Function('page',`return (${code.code})(page)`)(page);
   receipts.push({action:structuredClone(currentAction),dispatch_delta:dispatches.length-count,outcome:structuredClone(result),observation:structuredClone(lastObservation)});
   if(result.status==='SUCCEEDED'){
    if(currentAction.verb==='drag')stop=true;
    else{const e=lastObservation.ui.elements.find(e=>e.ref===currentAction.ref);
     if(e.date_time_cell?.role==='output_source')await load('pair-LKey-native-preflight.json');
     else if(e.date_time_cell?.role==='output_relation_remove')await load('pair-LKey-native-settled-unbound.json');
     else throw Error('unexpected first-pair action');
    }
   }
   return result;
  };
  const channel=createNodeProcedure({operation,execute,preparedNodeContext:binding,targetOrigin:captured.origin,targetBuild:captured.loginom_build,maxSteps:256,
   record:async e=>{journal.push(structuredClone(e));if(e.phase==='node_observation_completed')lastObservation=structuredClone(e.outcome.output);return structuredClone(e);},
   wrapMutation:(code,r)=>({code:withBrowserReceipt('('+code+')(page)',{receipt_namespace:'independent-refresh',receipt_id:r.id,receipt_signature:r.signature,operation_id:r.id}),reference:r})});
  const initial=await channel.observe({condition:'independent complete native Join preflight',readMappings:true,ready:s=>s.node_mapping?.verified===true});
  await configureJoinOutput(channel,{...config.configuration,node_context:initial.node_mapping.node_context,default_output_order:true},config.parameters,{});
 }catch(e){error={name:e.name,message:e.message,receipt:e.receipt??null};}
 finally{await context.close();await browser.close();}
 const dragReceipts=receipts.filter(r=>r.action?.verb==='drag'),refused=dragReceipts.filter(r=>r.outcome.status==='NOT_APPLIED');
 const successfulDrag=dragReceipts.filter(r=>r.outcome.status==='SUCCEEDED'&&r.dispatch_delta===1);
 await fs.writeFile(path.join(output,variant+'-harness-debug.json'),JSON.stringify({error,operation,receipts,journal,dispatches},null,2)+'\n');
 assert.equal(refused.length,1);assert.equal(refused[0].outcome.error.code,'UI_EPOCH_CHANGED');assert.equal(refused[0].outcome.effect_possible,false);assert.equal(refused[0].dispatch_delta,0);
 assert.equal(receipts.filter(r=>r.action?.verb==='click'&&r.outcome.status==='SUCCEEDED').length,2);
 assert.equal(journal.filter(e=>e.phase==='node_step_refresh_authorized').length,1);
 const refreshed=journal.findLast(e=>e.phase==='node_observation_sample')?.outcome?.output??dragReceipts.at(-1)?.observation,unbound=refreshed?.ui.elements.find(e=>e.date_time_cell?.link?.state==='unbound')?.date_time_cell?.link;
 const data={variant,dispatch:dispatches.length,reconnect_dispatch:successfulDrag.length,epoch_refusals:refused.length,refresh_authorizations:1,
  refreshed_mapping_verified:refreshed?.node_mapping?.verified,refreshed_source_hint:unbound?.source_display_name,refreshed_type_hint:unbound?.source_data_type,
  refreshed_retained_origin:unbound?.inventory?.records?.[1]?.[1]?.definition?.OriginType,
  browser_closed:true,safety_pass:variant==='unchanged'?successfulDrag.length===1:successfulDrag.length===0,error,requests_all_fulfilled_locally:requests,
  prior_effect_possible:operation.nodeEffectPossible===true,cleanup_scope:'offline context/browser closed in finally; no server cleanup or rollback claim'};
 assert.equal(data.safety_pass,true,JSON.stringify(data));assert.equal(data.dispatch,variant==='unchanged'?3:2);if(variant==='stale_unbound_label')assert.equal(data.refreshed_source_hint,'foreign');if(variant==='stale_unbound_type')assert.equal(data.refreshed_type_hint,5);if(variant==='changed_retained_origin')assert.equal(data.refreshed_retained_origin,1);assert.equal(data.prior_effect_possible,true);await fs.writeFile(path.join(output,variant+'.json'),JSON.stringify({data,operation,receipts,journal,dispatches},null,2)+'\n');
});
