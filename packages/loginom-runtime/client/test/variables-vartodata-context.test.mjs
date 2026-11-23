import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readVariablesToTableBrowser,readVariablesToTableContext} from '../lib/variables-vartodata-context.mjs';

function fixture(mode='columns',change=()=>{}){
 const base='MF;TF-1;WizrdMCF;VariablesToDataWizard',tids={},components={};
 const root={checkVisibility:()=>true,contains:e=>Object.values(tids).flat().includes(e)};tids[base]=[root];
 for(const [key,selected] of [['rbVarToColumns',mode==='columns'],['rbVarToRows',mode==='rows']]){
  const element={id:key,checkVisibility:()=>true,classList:{contains:c=>c==='x-form-cb-checked'&&selected}};
  tids[base+';'+key]=[element];components[key]={el:{dom:element},getValue:()=>selected,isDisabled:()=>false};
 }
 change({tids,components,base});
 const document={querySelectorAll:s=>tids[JSON.parse(s.slice(10,-1))]??[]};
 return JSON.parse(JSON.stringify(vm.runInNewContext('('+readVariablesToTableBrowser.toString()+')',{document,Ext:{getCmp:id=>components[id]}})('MF;TF-1')));
}
test('native radio selection distinguishes columns and rows without reading InputEl.checked',()=>{
 for(const mode of ['columns','rows']){const result=fixture(mode);assert.equal(result.verified,true);assert.equal(result.mode,mode);assert.equal(result.settings_applied,false);}
});
test('missing, duplicate, hidden, mismatched or mutually checked radios cannot prove configuration',()=>{
 for(const change of [f=>f.tids[f.base].push(f.tids[f.base][0]),f=>f.tids[f.base][0].checkVisibility=()=>false,
  f=>f.components.rbVarToColumns.el.dom={},f=>f.components.rbVarToRows.getValue=()=>true,
  f=>f.components.rbVarToColumns.getValue=()=>false,f=>delete f.tids[f.base+';rbVarToRows'],
  f=>f.components.rbVarToColumns.isDisabled=()=>true])assert.equal(fixture('columns',change).verified,false);
});
test('native observer refuses port wizards and changed node ownership',async()=>{
 const owner={verified:true,surface:'wizard',document_id:'doc',workflow_id:'wf',node_id:'n'};
 const page={evaluate:async()=>({verified:true,mode:'columns'})},binding={workflow_ref:{prefix:'MF;TF-1'}};
 for(const field of ['input_port','output_port'])assert.equal((await readVariablesToTableContext(page,binding,async()=>({...owner,[field]:{port:0}}))).verified,false);
 let reads=0;assert.equal((await readVariablesToTableContext(page,binding,async()=>({...owner,node_id:++reads===1?'n':'other'}))).verified,false);
});
