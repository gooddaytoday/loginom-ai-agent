import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readSmoothingBrowser,readSmoothingContext} from '../lib/smoothing-context.mjs';
function fixture(change=()=>{}){
 const base='MF;TF-1;WizrdMCF;SmoothingWizard;',nodes=new Map(),components={};
 const add=(key,component)=>{const element={id:key,checkVisibility:()=>true,contains:()=>true};nodes.set(base+key,element);components[key]={el:{dom:element},...component};return components[key];};
 const record={isModel:true,internalId:'x',data:{Name:'X',DisplayName:'X',DataType:4,DataKind:1,Usable:true,Algorithm:0}};
 const text={isModel:true,internalId:'tag',data:{Name:'Tag',DisplayName:'Tag',DataType:5,DataKind:2,Usable:false,Algorithm:0}};
 const records=[record],source=[record,text],store={$className:'Ext.data.Store',getData:()=>({items:records,getSource:()=>({items:source})}),getCount:()=>records.length,isLoading:()=>false};
 const grid=add('grdColumnsSettings',{getStore:()=>store,getSelectionModel:()=>({getSelection:()=>[record]})});
 const queue=Symbol('LockQueue'),wizard={el:{dom:{}}};wizard[queue]={IsEmpty:true};nodes.set('MF;TF-1;WizrdMCF',wizard.el.dom);wizard.el.dom.id='wizard';components.wizard=wizard;
 class SmoothingWizard{};
 const controller=Object.assign(new SmoothingWizard(),{FColumnsStore:store,FWizardForm:{FView:wizard}});
 const root=add('',{'@@TestCmpController':controller});nodes.delete(base);nodes.set(base.slice(0,-1),root.el.dom);
 const controls={};
 for(const [key,value] of Object.entries({rbLambda:true,rbPeriod:false,edtLambda:1,edtPeriod:6})){
  controls[key]=add(key+';ValueControl',{getValue:()=>value});add(key+';SwitchButton',{pressed:false});
 }
 change({record,records,source,store,grid,queue,wizard,controls,components,add});
 const context=vm.createContext({document:{querySelectorAll:s=>{const t=JSON.parse(s.slice(10,-1));return nodes.has(t)?[nodes.get(t)]:[];}},Ext:{getCmp:id=>components[id]}});
 return JSON.parse(JSON.stringify(vm.runInContext('('+readSmoothingBrowser.toString()+')',context)('MF;TF-1')));
}
test('HP reader accepts numeric projection but refuses filtered, pending, variable and foreign UI',()=>{
 assert.equal(fixture().verified,true);
 for(const change of [f=>f.store.isLoading=()=>true,f=>f.records.push(f.record),f=>f.source.push({...f.record,internalId:'missing'}),f=>f.record.data.DataType=5,f=>f.record.data.Algorithm=1,f=>f.wizard[f.queue].IsEmpty=false,f=>f.components['edtLambda;SwitchButton'].pressed=true,f=>f.controls.edtLambda.getValue=()=>NaN,f=>f.controls.rbPeriod.getValue=()=>true,f=>f.grid.getSelectionModel=()=>({getSelection:()=>[{...f.record}]})])assert.equal(fixture(change).verified,false);
});
test('HP context refuses changed node and separate port surfaces',async()=>{
 let count=0;const owner={verified:true,surface:'wizard',node_id:'a'},page={evaluate:async()=>({verified:true})},binding={workflow_ref:{prefix:'x'}};
 assert.equal((await readSmoothingContext(page,binding,async()=>({...owner,node_id:++count===1?'a':'b'}))).verified,false);
 assert.equal((await readSmoothingContext(page,binding,async()=>({...owner,output_port:{port:0}}))).verified,false);
});

test('wavelet reader owns exact family/order/depth/boundary controls and refuses variable or pending settings',()=>{
 const wavelet=f=>{
  f.record.data.Algorithm=1;
  for(const key of ['pedWaveletType','edtWaveletOrder','edtDecompositionLevel','edtEdgeExtension'])f.add(key+';SwitchButton',{pressed:false});
  for(const [index,suffix] of ['','-1','-2'].entries())f.add('pedWaveletType;ValueControl;radiofield'+suffix,{getValue:()=>index===0});
  f.add('edtWaveletOrder;ValueControl',{getValue:()=>1});f.add('edtDecompositionLevel;ValueControl',{getValue:()=>2});
  f.add('edtEdgeExtension;ValueControl',{getRawValue:()=> 'Симметричное'});
 };
 const value=fixture(wavelet);assert.equal(value.verified,true);
 assert.deepEqual(value.settings,{family:'daubechies',order:1,depth:2,boundary:'symmetric'});
 for(const boundary of ['Антисимметричное','Симметричное без крайней точки']){
  const result=fixture(f=>{wavelet(f);f.components['edtEdgeExtension;ValueControl'].getRawValue=()=>boundary;});
  assert.equal(result.verified,true);assert.equal(result.settings.boundary,boundary);assert.notEqual(result.settings.boundary,'symmetric');
 }
 for(const fault of [f=>f.components['edtWaveletOrder;SwitchButton'].pressed=true,f=>f.components['edtDecompositionLevel;ValueControl'].getValue=()=>NaN,f=>f.wizard[f.queue].IsEmpty=false])assert.equal(fixture(f=>{wavelet(f);fault(f);}).verified,false);
});
