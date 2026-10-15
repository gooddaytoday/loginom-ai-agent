import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fixture from './fixtures/output-links-native.mjs';
import {hydrate} from './fixtures/output-links-hydrate.mjs';
import {makeWorkspaceUiCode,validateUiAction} from '../lib/workspace-ui.mjs';
const capture=fixture['native-selected-complete.json'],prepared=fixture['source-open.json'];
const binding={document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node:{document_id:prepared.document_id,workflow_id:prepared.workflow_ref.workflow_id,node_id:capture.ledger[0].node_id}};
// Counterfactual cached native stores and DOM, not a measured wide native UI.
// The production serialized observer must still prove every record/row/pair.
const executablePath=process.env.LOGINOM_FIXTURE_BROWSER;
test('bounded vacant Links inventory through serialized observer', {skip:!executablePath},async t=>{
 const {chromium}=createRequire(import.meta.url)('playwright');
 const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:capture.viewport});
 await context.route('**/*',r=>r.fulfill({status:200,contentType:'text/html',body:'<html><body></body></html>'}));
 const execute=(page,options)=>new Function('page',`return (${makeWorkspaceUiCode({expected_build:capture.loginom_build,expected_origin:capture.origin,prepared_node_context:binding,...options})})(page)`)(page);
 const observe=async page=>{const a=await execute(page,{mode:'observe'});assert.equal(a.status,'SUCCEEDED');const b=await execute(page,{mode:'observe',root_ref:a.output.wizard.root_ref});assert.equal(b.status,'SUCCEEDED');return b.output;};
 const links=s=>s.ui.elements.filter(e=>e.signature?.date_time_cell?.link);
 const cases=[[1,'vacant'],[2,'vacant'],[6,'vacant'],[80,'vacant'],[80,'full'],[81,'vacant'],[80,'two_vacant'],[80,'undefined'],[80,'foreign_connected'],[80,'pending'],[80,'foreign_owner'],[80,'missing_row'],[80,'duplicate_row'],[80,'missing_draw'],[80,'duplicate_pair'],[80,'delete_alias'],[80,'missing_opening'],[80,'invalid_store'],[80,'native_tables'],[80,'selection_inventory'],[80,'unknown_error'],[80,'nonstring_error'],[80,'scan_limit']];
 try{for(const [count,variant] of cases)await t.test(`${count} ${variant}`,async()=>{
  const page=await context.newPage();
  try{
   await hydrate(page,capture,undefined,prepared,{FLinksUpdateMode:false,FRelationRefreshMode:false,FWaitingRedraw:false});
   await page.evaluate(({count,variant})=>{
    const f=__nativeFixture,{get,grids,draw,styles}=f,records=[];
    for(let side=0;side<2;side++){
     const grid=get(grids[side].element),old=get(grids[side].records[0].object),row=grid.querySelector('table.x-grid-item'),parent=row.parentElement;
     const template=row.cloneNode(true),raw=[row,...row.querySelectorAll('*')];
     grid.querySelectorAll('table.x-grid-item').forEach(e=>e.remove());
     const rs=[];
     for(let i=0;i<count;i++){
      const name='Field'+i,id=String((side+1)*1000+i),r={...old,internalId:id,data:{...old.data,ID:i,Index:i,Name:name,DisplayName:name,ConnectedRecord:null}};rs.push(r);
      const next=template.cloneNode(true),els=[next,...next.querySelectorAll('*')];
      for(let j=0;j<els.length;j++){
       const e=els[j],o=raw[j];styles.set(e,styles.get(o));
       const rect={...o.getBoundingClientRect(),y:150+i*5,top:150+i*5,bottom:154+i*5,height:4};
       e.style.top=rect.top+'px';e.style.height='4px';e.getBoundingClientRect=()=>rect;e.getClientRects=()=>[rect];e.checkVisibility=()=>true;
       if(e.hasAttribute('id'))e.id=e.id+'-wide-'+i;
       const tid=e.getAttribute('data-tid');if(tid){e.setAttribute('data-tid',tid.replace(/(colSourceName_|colDisplayName_).*/, '$1'+name));e.textContent=name;}
      }
      next.setAttribute('data-recordid',id);next.setAttribute('data-recordindex',String(i));parent.append(next);
     }
     const store=get(grids[side].store);store.getCount=store.getTotalCount=()=>rs.length;store.getData=()=>({items:rs,getSource:()=>({items:rs})});records.push(rs);
    }
    draw.FLinks={};draw.FSelectedLinks={};draw.FDrawLinkItems={};
    const vacant=variant==='full'?0:variant==='two_vacant'?2:1;
    for(let i=vacant;i<count;i++){
     const pair=[records[0][i],records[1][i]],key=pair.map(r=>r.internalId).join('_');pair[0].data.ConnectedRecord=pair[1];pair[1].data.ConnectedRecord=pair[0];
     draw.FLinks[key]=pair;draw.FDrawLinkItems[key]={LinkID:key};
    }
    if(variant==='undefined')records[1][0].data.ConnectedRecord=undefined;
    if(variant==='foreign_connected')records[1][0].data.ConnectedRecord={};
    if(variant==='pending')f.c.FLinksUpdateMode=true;
    // Counterfactual proof inventory only; keep the outer retained-owner values() read intact.
    if(variant==='missing_opening')__loginomDockPreparationV1.outputPortOpenReceipts.entries=()=>[][Symbol.iterator]();
    if(variant==='invalid_store')get(grids[0].store).getProxy=()=>({pendingOperations:{pending:{}}});
    if(variant==='native_tables')draw.FTables=[];
    if(variant==='selection_inventory')draw.FSelectedLinks=null;
    if(['unknown_error','nonstring_error','scan_limit'].includes(variant))Object.defineProperty(f.c,'FLinksUpdateMode',{get(){
     if(variant==='scan_limit')throw Object.assign(new Error('private native text'),{code:'UI_SCAN_LIMIT'});
     if(variant==='nonstring_error')throw {message:{private:'field/DOM/name'}};
     throw new Error('private field/DOM/name');
    }});
    if(variant==='foreign_owner')f.ledger[0].node.FGuid='foreign';
    if(variant==='missing_row')get(grids[0].element).querySelector('table.x-grid-item').remove();
    if(variant==='duplicate_row'){const row=get(grids[0].element).querySelector('table.x-grid-item');row.parentElement.append(row.cloneNode(true));}
    const key=Object.keys(draw.FLinks)[0];
    if(variant==='missing_draw')delete draw.FDrawLinkItems[key];
    if(variant==='duplicate_pair')draw.FLinks.duplicate=draw.FLinks[key];
    if(variant==='delete_alias')draw.FDrawLinkItems[key].DrawDeleteButton=[{element:{dom:document.body}}];
   },{count,variant});
   if(variant==='foreign_owner'){const refused=await execute(page,{mode:'observe'});assert.equal(refused.status,'NOT_APPLIED');return;}
   if(variant==='scan_limit'){const result=await execute(page,{mode:'observe'});assert.equal(result.status,'NOT_APPLIED');assert.equal(result.error.code,'UI_SCAN_LIMIT');assert.ok(!JSON.stringify(result).includes('private native text'));return;}
   const s=await observe(page),ls=links(s),positive=['vacant','full'].includes(variant)&&count<=80;
   if(positive){
    assert.equal(s.output_links_proof,undefined);
    assert.equal(ls.length,variant==='full'?count*2:2);
    const source=ls.find(e=>e.signature.date_time_cell.role==='output_source'),target=ls.find(e=>e.signature.date_time_cell.role==='output_target');
    if(variant==='vacant'){
     assert.equal(source.signature.date_time_cell.link.state,'unbound');
     assert.equal(source.signature.date_time_cell.link.inventory.pairs.length,count-1);
     assert.deepEqual(source.signature.date_time_cell.link.inventory.records.map(x=>x.length),[count,count]);
    }
    validateUiAction({verb:'drag',source_ref:source.ref,target_ref:target.ref},s);
    assert.ok(!s.ui.elements.some(e=>e.allowed_actions.some(a=>['finish_wizard','execute_wizard'].includes(a))));
   }else {
    assert.equal(ls.length,0,'unsafe inventory must not publish Links actions');
    if(['unknown_error','nonstring_error'].includes(variant)){assert.equal(s.output_links_proof,undefined);assert.ok(!JSON.stringify(s).includes('private field/DOM/name'));}
    else {
     const reason={missing_opening:'output_link_opening',invalid_store:'output_link_inventory',native_tables:'output_link_native_tables',selection_inventory:'output_link_selection_inventory',pending:'output_link_settlement',missing_row:'output_link_row',duplicate_row:'output_link_row',missing_draw:'output_link_remove_inventory',duplicate_pair:'output_link_pairs',delete_alias:'output_link_remove_aliases'}[variant]??'output_link_pairs';
     assert.equal(s.output_links_proof.reason,reason);
     assert.deepEqual(Object.keys(s.output_links_proof).sort(),['counts','reason']);
     const expected={sources:count,targets:count,pairs:variant==='duplicate_pair'?80:variant==='two_vacant'?78:count-1,unbound_sources:variant==='two_vacant'?2:1,unbound_targets:variant==='two_vacant'?2:1};
     if(['missing_opening','invalid_store'].includes(variant))Object.assign(expected,{sources:null,targets:null,pairs:null,unbound_sources:null,unbound_targets:null});
     if(['pending','native_tables','selection_inventory'].includes(variant))Object.assign(expected,{pairs:null,unbound_sources:null,unbound_targets:null});
     assert.deepEqual(s.output_links_proof.counts,expected);
     assert.ok(Object.values(s.output_links_proof.counts).every(v=>v===null||Number.isInteger(v)));
    }
   }
  }finally{await page.close();}
 });}finally{await context.close();await browser.close();}
});
