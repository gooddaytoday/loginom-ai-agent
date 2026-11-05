import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readVariablesCalculatorBrowser,readVariablesCalculatorContext} from '../lib/variables-calculator-context.mjs';
function fixture() {
 const all=[],components={},base='MF;TF;WizrdMCF;CalcVariablesWizard;';
 const element=(tid,parent=null)=>{const e={id:'e'+all.length,tid,parent,checkVisibility:()=>true,
  contains(x){return x===this||!!x.parent&&this.contains(x.parent)},querySelectorAll:()=>[]};all.push(e);return e;};
 const root=element(base.slice(0,-1)),grid=element(base+'grdExpressions',root),editor=element(base+'cmpExpression',root);
 const wrapper={},doc={lineCount:()=>1,firstLine:()=>0,lastLine:()=>0,getLine:()=> '120'};
 wrapper.CodeMirror={getWrapperElement:()=>wrapper,getDoc:()=>doc};editor.querySelectorAll=()=>[wrapper];
 const records=[{isModel:true,internalId:'r0',data:{ID:0,Index:0,Name:'limit',DisplayName:'Лимит',DataType:4,Expression:'100',Description:'',Intermediate:false}},
  {isModel:true,internalId:'r1',data:{ID:1,Index:1,Name:'missing',DisplayName:'Нет значения',DataType:4,Expression:'NULL',Description:'keep',Intermediate:false}}];
 const selection=[records[0]],store={$className:'Ext.data.Store',isLoading:()=>false,getData:()=>({items:records,getSource:()=>({items:records})}),getCount:()=>records.length,getTotalCount:()=>records.length};
 components[grid.id]={el:{dom:grid},getStore:()=>store,getSelectionModel:()=>({getSelection:()=>selection})};
 const context={Ext:{getCmp:id=>components[id]},document:{querySelectorAll:q=>q.startsWith('[data-tid=')?all.filter(e=>e.tid===JSON.parse(q.slice(10,-1))):all.filter(e=>e.mask)}};
 return {all,root,grid,editor,doc,records,selection,store,components,element,
  read:()=>vm.runInNewContext('('+readVariablesCalculatorBrowser.toString()+')("MF;TF")',context)};
}
test('native configuration reads selected CodeMirror text and retains unselected formula and description',()=>{
 const r=fixture().read();assert.equal(r.verified,true);assert.equal(r.expressions[0].formula,'120');
 assert.equal(r.expressions[1].formula,'NULL');assert.equal(r.expressions[1].description,'keep');
 assert.equal(r.settings_applied,false);assert.equal(r.syntax_validity,'unverified');
 assert.equal(r.expressions[0].type,'integer');assert.equal(r.expressions[1].index,1);
});
test('incomplete or foreign stores, duplicate identities, foreign selection and unsupported native types refuse',()=>{
 for(const mutate of [f=>f.store.isLoading=()=>true,f=>f.store.isBufferedStore=true,f=>f.store.getCount=()=>3,
  f=>f.store.getData=()=>({items:f.records,getSource:()=>({items:[f.records[0],f.records[0]]})}),
  f=>f.records[1].internalId='r0',f=>f.records[1].data.ID=0,f=>f.records[1].data.Name='LIMIT',
  f=>f.records[1].data.Index=0,f=>f.records[1].data.DataType=6,f=>f.selection[0]={...f.records[0]},
  f=>f.doc.getLine=()=> '1\r2',f=>f.doc.lineCount=()=>129,f=>f.root.mask=true,
  f=>f.components[f.grid.id].el.dom=f.editor,f=>f.element('MF;TF;WizrdMCF;ExprEditForm'),
  f=>f.element('MF;TF;WizrdMCF;CalcVariablesWizard'),f=>f.records[1].data.Expression=undefined]) {
  const f=fixture();mutate(f);assert.equal(f.read().verified,false);
 }
});
test('owner is read before and after the local inventory, including on an invalid surface',async()=>{
 let calls=0;const binding={workflow_ref:{prefix:'MF;TF'}};
 const page={evaluate:async()=>({verified:true})};
 assert.equal((await readVariablesCalculatorContext(page,binding,async()=>({verified:true,surface:'wizard',node_id:String(++calls)}))).reason,'variables_calculator_node_changed');
 assert.equal((await readVariablesCalculatorContext(page,binding,async()=>({verified:true,surface:'wizard',output_port:{}}))).reason,'variables_calculator_node_surface');
});
