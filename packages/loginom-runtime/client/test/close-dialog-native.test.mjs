import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import fixture from './fixtures/close-dialog-native.mjs';
import {hydrate} from './fixtures/output-links-hydrate.mjs';
import {makeWorkspaceUiCode,validateUiAction} from '../lib/workspace-ui.mjs';
import {wizardCloseBinding,boundWizardCloseConfirmation,closePreparedWizard} from '../lib/node-wizard-close.mjs';
const capture=fixture['native-current-close-dialog.json'],prepared=fixture['workspace-chrome'];
const binding={document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node:{document_id:prepared.document_id,workflow_id:prepared.workflow_ref.workflow_id,node_id:capture.ledger[0].node_id}};
test('actual close dialog identity through serialized observer and typed resolver',{skip:!process.env.LOGINOM_FIXTURE_BROWSER},async t=>{
 const {chromium}=createRequire(import.meta.url)('playwright');
 const browser=await chromium.launch({executablePath:process.env.LOGINOM_FIXTURE_BROWSER,headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:capture.viewport});
 await context.route('**/*',r=>r.fulfill({status:200,contentType:'text/html',body:'<html><body></body></html>'}));
 const execute=(page,options)=>new Function('page',`return (${makeWorkspaceUiCode({expected_build:capture.loginom_build,expected_origin:capture.origin,prepared_node_context:binding,...options})})(page)`)(page);
 const setup=async()=>{const p=await context.newPage();await hydrate(p,capture,null,prepared);return p;};
 const observe=async p=>{const a=await execute(p,{mode:'observe'});assert.equal(a.status,'SUCCEEDED',JSON.stringify(a.error));const b=await execute(p,{mode:'observe',root_ref:a.output.ui.dialogs[0].ref});assert.equal(b.status,'SUCCEEDED',JSON.stringify(b.error));return b.output;};
 const save=async(n,v)=>{if(process.env.LOGINOM_CLOSE_EVIDENCE){await mkdir(process.env.LOGINOM_CLOSE_EVIDENCE,{recursive:true});await writeFile(process.env.LOGINOM_CLOSE_EVIDENCE+'/'+n+'.json',JSON.stringify(v,null,2));}};
 try{
  for(const prefix of ['msgbox-1','msgbox'])await t.test(prefix+' current native ownership permits typed dispatch; lost reply is not replayed',async()=>{
   const p=await setup();if(prefix==='msgbox')await p.evaluate(()=>{for(const e of document.querySelectorAll('[data-tid^="msgbox-1;"]'))e.setAttribute('data-tid',e.getAttribute('data-tid').replace(/^msgbox-1;/,'msgbox;'));});
   const s=await observe(p),yes=s.ui.elements.find(e=>e.tid===prefix+';tlb;yes'),b=wizardCloseBinding(s);
   assert.equal(boundWizardCloseConfirmation(s,b),true);validateUiAction({verb:'confirm_wizard_close',ref:yes.ref},s);
   let dispatch=0;p.mouse.click=async()=>{dispatch++;throw Error('lost Yes reply');};
   const result=await execute(p,{mode:'act',snapshot:s,action:{verb:'confirm_wizard_close',ref:yes.ref}});
   assert.equal(result.status,'AMBIGUOUS');assert.equal(dispatch,1);
   for(const lossAt of [1,2]){let calls=0;await assert.rejects(closePreparedWizard({observe:async()=>s,perform:async args=>{assert.equal(args.ready(s),true);if(calls===1)assert.equal(args.resolve(s).ref,yes.ref);calls++;if(calls===lossAt)throw Error('lost reply');}}),/lost reply/);assert.equal(calls,lossAt);}
   await save(prefix,{observation:s,binding:b,result,dispatch,synthetic:prefix==='msgbox',server_requests:0});await p.close();
  });
  for(const variant of ['foreign_dialog_ext','foreign_yes_ext','foreign_no_ext','foreign_toolbar_owner','foreign_yes_owner','missing_yes','missing_no','duplicate_yes','duplicate_dialog','hidden_yes','hidden_no','foreign_prefix','foreign_opening','foreign_root','stale_ref','epoch'])await t.test(variant+' rejects before dispatch',async()=>{
   const p=await setup(),s=await observe(p),yes=s.ui.elements.find(e=>e.allowed_actions.includes('confirm_wizard_close'));assert.ok(yes);
   await p.evaluate(v=>{
    const yes=document.querySelector('[data-tid="msgbox-1;tlb;yes"]'),no=document.querySelector('[data-tid="msgbox-1;tlb;no"]'),dialog=yes.closest('.x-window');
    if(v==='foreign_dialog_ext')Ext.getCmp(dialog.id).el.dom=document.body;
    else if(v==='foreign_yes_ext')Ext.getCmp(yes.id).el.dom=document.body;
    else if(v==='foreign_no_ext')Ext.getCmp(no.id).el.dom=document.body;
    else if(v==='foreign_toolbar_owner')Ext.getCmp(yes.id).ownerCt.ownerCt={};
    else if(v==='foreign_yes_owner')Ext.getCmp(yes.id).ownerCt={};
    else if(v==='missing_yes')yes.remove();else if(v==='missing_no')no.remove();
    else if(v==='duplicate_yes')yes.parentElement.append(yes.cloneNode(true));
    else if(v==='duplicate_dialog')document.body.append(dialog.cloneNode(true));
    else if(v==='hidden_yes')Ext.getCmp(yes.id).hidden=true;
    else if(v==='hidden_no')Ext.getCmp(no.id).hidden=true;
    else if(v==='foreign_prefix')yes.setAttribute('data-tid','msgbox-2;tlb;yes');
    else if(v==='foreign_opening')__nativeFixture.ledger[0].operation_id='foreign';
    else if(v==='foreign_root')__nativeFixture.model.FView.el.dom=document.body;
    else if(v==='stale_ref')yes.setAttribute('data-tid','msgbox-1;tlb;no');
    else document.body.append(document.createElement('div'));
   },variant);
   const fresh=await execute(p,{mode:'observe',root_ref:s.ui.dialogs[0].ref});
   if(fresh.status==='SUCCEEDED'&&variant!=='epoch')assert.ok(!fresh.output.ui.elements.some(e=>e.allowed_actions.includes('confirm_wizard_close')));
   let dispatch=0;p.mouse.click=async()=>{dispatch++;};const result=await execute(p,{mode:'act',snapshot:s,action:{verb:'confirm_wizard_close',ref:yes.ref}});
   assert.equal(result.status,'NOT_APPLIED',JSON.stringify(result.error));assert.equal(dispatch,0);await save(variant,{result,dispatch,synthetic:true});await p.close();
  });
 }finally{await context.close();await browser.close();}
});
