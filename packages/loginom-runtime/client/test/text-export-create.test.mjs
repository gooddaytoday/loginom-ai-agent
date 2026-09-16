import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {NODE_TYPES} from '../lib/node-contracts.mjs';
import {mutateGraph} from '../lib/node-target-browser.mjs';
import {exportPaletteScroll} from '../lib/text-export-palette.mjs';
function fixture(mode={}){
 const prefix='MF;TF-1',ownerTid=prefix+';ModelForm;pnlVendors;tree',palette=prefix+';ModelForm;colVendors_Компоненты>Экспорт>Текстовый_файл;TreeText',rootTid=prefix+';ModelForm;cmpDiagram',tabTid='MF;cntMain;cntWorkspace;Workspace;t.br;tb-1';
 let top=0,scrolls=0,drags=0,held=false,created=false;
 const rect=(x,y,width,height)=>({x,y,width,height,right:x+width,bottom:y+height});
 const canvas={getBoundingClientRect:()=>rect(300,100,1100,720),contains:e=>e===canvas},tab={classList:{contains:()=>true}};
 const row={contains:e=>e===item,querySelectorAll:()=>mode.icon?[]:[{}]};
 const owner={isConnected:true,contains:e=>e===row||e===item,checkVisibility:()=>true,getBoundingClientRect:()=>rect(10,100,280,600),clientHeight:600,scrollHeight:2001,
  get scrollTop(){return top;},set scrollTop(v){scrolls++;top=v;if(mode.cancelAfterScroll)page[Symbol.for('loginom-dock.node-target-cancel')]=new Set(['effect']);if(mode.scrollFailure)throw Error('scroll failed');}};
 const item={textContent:'Текстовый файл',checkVisibility:()=>true,closest:()=>null,contains:e=>e===item,getBoundingClientRect:()=>rect(50,(mode.visible?200:1800)-top,100,20)};
 const exact=new Map([[ownerTid,mode.owner?[{}]:[owner]],[palette,mode.duplicate?[item,item]:[item]],[palette.replace(/;TreeText$/,''),[row]],[rootTid,[canvas]],[tabTid,[tab]]]);
 const document={querySelectorAll:selector=>exact.get(JSON.parse(selector.slice(10,-1)))??[],elementFromPoint:(x,y)=>mode.overlay?{}:x>=300?canvas:x===100&&y===item.getBoundingClientRect().y+10?item:owner};
 const before={dom_epoch:1,interaction_ready:true,nodes:[]};
 const p={document,id:'doc',receipts:new Map([['r',{phase:'verified',workflowId:'wf',tab}]]),nodeTargetDomEpochs:{objects:new Map([[canvas,1]])}};
 const globals={document,innerWidth:1508,innerHeight:862,__loginomDockPreparationV1:p};
 const evaluate=(fn,args,element)=>vm.runInNewContext('('+fn.toString()+')('+(element?'element,args':'args')+')',{...globals,args,element});
 const page={evaluate:(fn,args)=>evaluate(fn,args),waitForTimeout:async()=>{},locator:selector=>{
  const elements=exact.get(JSON.parse(selector.slice(10,-1)))??[],element=elements[0];
  return {count:async()=>elements.length,isVisible:async()=>true,isEnabled:async()=>true,boundingBox:async()=>{const {right,bottom,...b}=element.getBoundingClientRect();return b;},evaluate:async(fn,args)=>evaluate(fn,args,element),elementHandle:async()=>({evaluate:async(fn,args)=>evaluate(fn,args,element),dispose:async()=>{}})};},
  mouse:{move:async()=>{},down:async()=>{held=true;drags++;},up:async()=>{if(held)created=true;held=false;}},keyboard:{press:async()=>{}}};
 const task={deadline:Date.now()+10000,request:{document_id:'doc',workflow_ref:{workflow_id:'wf',prefix,tab_tid:tabTid}},types:NODE_TYPES,effect:{id:'effect',kind:'create',before,parameters:{type:'exports.text',position:{x:mode.drop?5000:600,y:380}}}};
 if(mode.cancel)page[Symbol.for('loginom-dock.node-target-cancel')]=new Set(['effect']);
 const read=async()=>created||scrolls&&mode.graphChange?{...before,nodes:[{id:'changed'}]}:structuredClone(before);
 return {run:()=>mutateGraph(page,task,read,exportPaletteScroll),counts:()=>({scrolls,drags})};
}
test('new export performs one owner scroll and one drag, or no scroll for visible item',async()=>{
 for(const visible of [false,true]){const f=fixture({visible}),r=await f.run();assert.equal(r.status,'SUCCEEDED',r.error);assert.deepEqual(f.counts(),{scrolls:visible?0:1,drags:1});assert.equal(r.cleanup_complete,true);}
});
test('export creation cannot drag after invalid owner, overlay, graph, drop, cancellation or scroll failure',async()=>{
 for(const mode of [{owner:true},{duplicate:true},{icon:true},{overlay:true},{graphChange:true},{drop:true},{cancel:true},{cancelAfterScroll:true},{scrollFailure:true}]){
  const f=fixture(mode),r=await f.run();assert.notEqual(r.status,'SUCCEEDED',JSON.stringify(mode));assert.equal(f.counts().drags,0,JSON.stringify(mode));
  if(f.counts().scrolls)assert.equal(r.effect_possible,true);if(mode.scrollFailure)assert.equal(r.cleanup_complete,false);
 }
});
