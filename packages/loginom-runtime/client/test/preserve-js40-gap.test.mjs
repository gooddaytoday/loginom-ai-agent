import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {createNodeTargetBrowserAdapter} from '../lib/node-target-browser.mjs';
function gapFixture(occupied=[]){
 const request={document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF'},target:{kind:'new',type:'integration.rest_request'},inputs:[]};
 const graph={complete:true,interaction_ready:true,document_id:'doc',workflow_ref:request.workflow_ref,nodes:[],links:[]};
 const box={x:0,y:0,left:0,right:800,top:0,bottom:600,width:800,height:600};
 const canvas={getBoundingClientRect:()=>box,querySelectorAll:()=>occupied.map(r=>({getBoundingClientRect:()=>({...r,width:r.right-r.left,height:r.bottom-r.top})})),scrollLeft:0,scrollTop:0};
 const controller={FController:{FDiagram:{FmxGraph:{container:canvas,view:{scale:1,translate:{x:0,y:0}}}}}};
 const context={innerWidth:800,innerHeight:600,document:{elementFromPoint:()=>canvas},bg:{app:{Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:controller})}}}}}}}};
 const adapter=createNodeTargetBrowserAdapter({build:'7.4.2',execute:async code=>{
  if(code.includes('async function readGraph'))return graph;
  if(code.includes('evaluateAll')||code.includes('const row=page.locator'))return true;
  return runInNewContext('('+code+')',context)({locator:()=>({evaluate:async(fn,arg)=>fn(canvas,arg)})});
 }});
 return {adapter,request,graph};
}

test('existing D28 JS 40px gap remains reachable with 32px fallback added',async()=>{
 const occupied=[{left:0,right:20,top:0,bottom:600},{left:200,right:800,top:0,bottom:600}];
 const f=gapFixture(occupied);f.request.target.type='programming.javascript';
 const p=structuredClone(await f.adapter.choosePosition(f.request,f.graph,Date.now()+10000));
 console.log(JSON.stringify({type:'programming.javascript',position:p,visible40pxPoint:{x:120,y:80},fixture:'synthetic occupied rectangles; not captured Loginom DOM'}));
 assert.deepEqual(p,{x:120,y:80});
});
