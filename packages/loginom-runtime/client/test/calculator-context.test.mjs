import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readCalculatorBrowser,readCalculatorContext} from '../lib/calculator-context.mjs';
function fixture() {
 const all=[],components={},base='MF;TF;WizrdMCF;CalcDataWizard;';
 const element=(tid,parent=null)=>{const e={id:'e'+all.length,tid,parent,checkVisibility:()=>true,getAttribute:k=>k==='data-tid'?tid:null,
  contains(x){return x===this||!!x.parent&&this.contains(x.parent)},querySelector:()=>null,querySelectorAll:()=>[]};all.push(e);return e};
 const root=element(base.slice(0,-1)),grid=element(base+'grdExpressions',root),input=element(base+'grdFields',root),editor=element(base+'cmpExpression',root);
 const wrapper={parent:editor},doc={lineCount:()=>1,firstLine:()=>0,lastLine:()=>0,getLine:()=> 'A + 2'};
 wrapper.CodeMirror={getWrapperElement:()=>wrapper,getDoc:()=>doc};editor.querySelectorAll=()=>[wrapper];
 const mode=element(base+'btnCalcMode',root);mode.querySelector=q=>q==='.bg-TBGCalcMode-cmExpression'?{}:null;
 const records=['X','Y'].map((name,i)=>({isModel:true,internalId:'r'+i,data:{ID:i,Index:i,Name:name,DisplayName:'Same',DataType:3,Expression:'A + 1',Description:'untouched',Intermediate:false,Replaced:false,Cached:true}}));
 const fields=[{isModel:true,internalId:'f1',data:{Name:'A',DisplayName:'Input',DataType:3,GroupType:'Fields',Replaced:false}}];
 const store=items=>({$className:'Ext.data.Store',isLoading:()=>false,getData:()=>({items,getSource:()=>({items})}),getCount:()=>items.length,getTotalCount:()=>0});
 const expressionStore=store(records),fieldStore=store(fields),selection=[records[1]];
 components[grid.id]={el:{dom:grid},getStore:()=>expressionStore,getSelectionModel:()=>({getSelection:()=>selection})};
 components[input.id]={el:{dom:input},getStore:()=>fieldStore};
 const context={Ext:{getCmp:id=>components[id]},document:{querySelectorAll:q=>q.startsWith('[data-tid=')?all.filter(e=>e.tid===JSON.parse(q.slice(10,-1))):all.filter(e=>e.mask)}};
 return {all,root,grid,input,editor,mode,records,fields,doc,selection,expressionStore,fieldStore,components,
  read:()=>vm.runInNewContext('('+readCalculatorBrowser.toString()+')("MF;TF")',context)};
}
test('calculator uses selected editor text and retains other cached expressions without evaluating them',()=>{
 const r=fixture().read();assert.equal(r.verified,true);assert.equal(r.expressions[0].formula,'A + 1');assert.equal(r.expressions[1].formula,'A + 2');
 assert.equal(r.expressions[1].cached,true);assert.equal(r.input_fields[0].name,'A');assert.equal(r.syntax_validity,'unverified');assert.equal(r.settings_applied,false);
});
test('calculator refuses incomplete stores, changed identities, foreign selection and unsupported mode',()=>{
 const mutations=[f=>f.expressionStore.isLoading=()=>true,f=>f.expressionStore.getCount=()=>4,
  f=>f.expressionStore.getData=()=>({items:f.records,getSource:()=>({items:[...f.records,{}]})}),
  f=>f.records[1].internalId='r0',f=>f.records[1].data.ID=0,
  f=>f.expressionStore.getData=()=>({items:f.records,getSource:()=>({items:[f.records[0],f.records[0]]})}),
  f=>f.fields[0].internalId=undefined,f=>f.records[1].data.Name='x',f=>f.records[1].data.Index=0,
  f=>f.selection[0]={...f.records[0]},f=>f.mode.querySelector=()=>null,f=>f.doc.getLine=()=> 'a\r',
  f=>f.doc.lineCount=()=>129,f=>f.fields[0].data.GroupType='Variables',f=>f.fields[0].data.DataType=999,
  f=>f.fieldStore.getData=()=>({items:f.fields,getSource:()=>({items:[...f.fields,{}]})}),f=>f.root.mask=true,
  f=>f.components[f.grid.id].el.dom=f.input];
 for(const [i,mutate] of mutations.entries()){const f=fixture();mutate(f);assert.equal(f.read().verified,false,'mutation '+i);}
});
test('calculator observation refuses changed owner even if the UI data itself is valid',async()=>{
 let calls=0;const page={evaluate:async()=>({verified:true})};
 assert.equal((await readCalculatorContext(page,{workflow_ref:{prefix:'MF;TF'}},async()=>({verified:true,surface:'wizard',node_id:String(++calls)}))).verified,false);
 assert.equal((await readCalculatorContext(page,{workflow_ref:{prefix:'MF;TF'}},async()=>({verified:true,surface:'wizard',output_port:{}}))).reason,'calculator_node_surface');
});
