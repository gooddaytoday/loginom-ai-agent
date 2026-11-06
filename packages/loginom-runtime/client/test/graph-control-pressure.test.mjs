import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {workspaceUiCapability} from '../lib/workspace-ui.mjs';
import {Page,build,origin} from './support/workspace-ui-fixture.mjs';
// Regression fixture from LAB-950; runs the production capability unchanged.
function graphLaunchFixture(){
 const page=new Page();page.context.innerWidth=1440;page.context.innerHeight=1000;const nodeDom=page.add('div','MF;TF-1;Graph;Calculator','',{x:100,y:100,width:100,height:50});
 const button=page.add('button','MF;TF-1;ModelForm;btnToggleActivateCurrent','',{x:400,y:50,width:30,height:25});
 button.id='run-button';button.attrs['data-qtip']='Выполнить узел (F9)';
 page.add('span',null,'',{x:405,y:55,width:10,height:10},button).attrs.class='bg-icon-run_current';
 const owner={FGuid:'node-a',FCell:{},FLocked:false};let selection=[owner.FCell];
 class ModelForm{};const model=new ModelForm();model.FDiagram={FNodes:{FCollection:[owner]},FmxGraph:{container:nodeDom.parentElement,getSelectionCells:()=>selection,view:{getState:()=>({shape:{node:nodeDom}})}}};
 const native={el:{dom:button},disabled:false,tooltip:'Выполнить узел'};
 page.context.Ext={getCmp:id=>id===button.id?native:null};page.app.ModelForm=ModelForm;
 page.app.Application={FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{FController:model}})}}}}};
 const binding={node:{node_id:'node-a'},workflow_ref:{navigation_path:[],prefix:'MF;TF-1'}};
 const execute=options=>vm.runInContext('('+workspaceUiCapability.toString()+')',page.context)(page,{expected_build:build,expected_origin:origin,prepared_node_context:binding,...options},async()=>({verified:true,surface:'graph',node_id:'node-a',tid:nodeDom.attrs['data-tid']}));
 return {page,button,nodeDom,owner,native,model,select:s=>selection=s,execute};
}

test('bound native Execute survives more than 240 graph controls',async()=>{
 const f=graphLaunchFixture();
 const before=await f.execute({mode:'observe'});
 assert.ok(before.output.ui.elements.some(e=>e.graph_execution?.node_id==='node-a'));
 for(let i=0;i<260;i++)f.page.add('button','MF;TF-1;Graph;Noise_'+i+';btnNoise','',{x:600+i%20,y:200+Math.floor(i/20),width:10,height:10});
 const observed=await f.execute({mode:'observe'});
 assert.equal(observed.status,'SUCCEEDED');
 const ui=observed.output.ui;
 console.log(JSON.stringify({elements:ui.elements.length,truncated:ui.truncated.elements,execute_present:ui.elements.some(e=>e.tid===f.button.attrs['data-tid'])}));
 assert.ok(ui.elements.length<=240);
 const button=ui.elements.find(e=>e.tid===f.button.attrs['data-tid']);
 assert.ok(button,'Bound native Execute was dropped from the compact observation');
 assert.deepEqual(Array.from(button.allowed_actions),['execute_graph_node']);
 assert.equal(button.graph_execution.node_id,'node-a');
});

function pressure(f){
 for(let i=0;i<260;i++)f.page.add('button','MF;TF-1;Graph;Noise_'+i+';btnNoise','',{x:600+i%20,y:200+Math.floor(i/20),width:10,height:10});
}

test('bound predecessor ports survive pressure without changing other control order',async()=>{
 const f=graphLaunchFixture();
 pressure(f);
 const foreign=f.page.add('div','MF;TF-1;Graph;CalculatorOther;Output_Data-0','',{x:800,y:400,width:10,height:10});
 const port=f.page.add('div','MF;TF-1;Graph;Calculator;Output_Data-0','',{x:200,y:120,width:10,height:10});
 const input=f.page.add('div','MF;TF-1;Graph;Calculator;Input_Var-1','',{x:100,y:120,width:10,height:10});
 const ui=(await f.execute({mode:'observe'})).output.ui;
 assert.equal(ui.elements.length,240);
 assert.ok(ui.truncated.elements);
 for(const e of [port,input]){
  const issued=ui.elements.find(x=>x.tid===e.attrs['data-tid']);
  assert.ok(issued,'Exact bound port was dropped');
  assert.equal(issued.kind,'port');
 }
 assert.ok(!ui.elements.some(x=>x.tid===foreign.attrs['data-tid']));
 assert.deepEqual(Array.from(ui.elements.filter(x=>x.tid.includes(';Noise_')),x=>x.tid),
  Array.from({length:236},(_,i)=>'MF;TF-1;Graph;Noise_'+i+';btnNoise'));
});

test('below the cap the existing control order is unchanged',async()=>{
 const f=graphLaunchFixture();
 const port=f.page.add('div','MF;TF-1;Graph;Calculator;Output_Data-0','',{x:200,y:120,width:10,height:10});
 const other=f.page.add('button','MF;TF-1;Graph;Other;btnNoise','',{x:800,y:400,width:10,height:10});
 const ui=(await f.execute({mode:'observe'})).output.ui;
 assert.equal(ui.truncated.elements,false);
 assert.deepEqual(Array.from(ui.elements,e=>e.tid),[f.nodeDom.attrs['data-tid'],port.attrs['data-tid'],other.attrs['data-tid'],f.button.attrs['data-tid'],'MF;cntMain;tlbMainToolbar;btnAvatar','MF;cntMain;cntWorkspace;Workspace;t.br;tb-1']);
});

for(const fault of ['foreign-selection','locked','disabled'])test('under pressure native Execute still refuses '+fault,async()=>{
 const f=graphLaunchFixture();pressure(f);
 if(fault==='foreign-selection')f.select([{}]);
 if(fault==='locked')f.owner.FLocked=true;
 if(fault==='disabled')f.native.disabled=true;
 const ui=(await f.execute({mode:'observe'})).output.ui;
 const button=ui.elements.find(e=>e.tid===f.button.attrs['data-tid']);
 assert.ok(button);
 assert.equal(button.graph_execution,undefined);
 assert.deepEqual(Array.from(button.allowed_actions),[]);
});
