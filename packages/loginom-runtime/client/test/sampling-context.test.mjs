import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readSamplingBrowser,readSamplingContext} from '../lib/sampling-context.mjs';
function fixture(change=()=>{}){
 const prefix='MF;TF-1',base=prefix+';WizrdMCF;SamplingComponentWizard';
 const root={checkVisibility:()=>true,contains:()=>true};
 const sizes=[{internalId:'size',data:{AbsoluteSize:5,Name:'Выбранные'}}],groups=[{internalId:'sample',data:{Name:'Выбранные'}},{internalId:'unused',data:{Name:'Неиспользуемые'}}];
 const store=items=>({$className:'Ext.data.Store',getData:()=>({items}),getCount:()=>items.length,isLoading:()=>false});
 const stores=[store(sizes),store(groups)];
 change({stores,sizes,groups});
 const grids=[{id:'sizes',querySelectorAll:()=>[]},{id:'groups',querySelectorAll:()=>[]}];
 const icon={getAttribute:key=>key==='class'?'rows':''},cell={querySelectorAll:()=>[icon],querySelector:()=>icon,getAttribute:()=>base+';SizeGridForm;colSizeType_0',textContent:'строк',closest:()=>({getAttribute:()=> 'size'})};
 const method={id:'method'};
 const document={querySelectorAll:s=>{const tid=JSON.parse(s.slice(10,-1));return ({[base]:[root],[base+';pedSamplingMethod;ValueControl']:[method],[base+';SizeGridForm;grdDataSet']:[grids[0]],[base+';SequenceMethodForm;grdSequence']:[grids[1]],[base+';SizeGridForm;colSizeType_0']:[cell]})[tid]??[];}};
 const Ext={getCmp:id=>id==='method'?{el:{dom:method},getRawValue:()=> 'Последовательный'}:{el:{dom:grids[id==='sizes'?0:1]},getStore:()=>stores[id==='sizes'?0:1],getSelectionModel:()=>({getSelection:()=>[]})}};
 return JSON.parse(JSON.stringify(vm.runInContext('('+readSamplingBrowser.toString()+')',vm.createContext({document,Ext}))(prefix)));
}
test('serialized sequential observer reads only complete cached records, binding unit icons to actual rows',()=>{
 const result=fixture(({sizes})=>Object.defineProperty(sizes[0].data,'Remote',{enumerable:true,get(){throw Error('remote getter accessed');}}));
 assert.equal(result.verified,true);assert.equal(result.sizes[0].values.AbsoluteSize,5);
 assert.equal(result.units[0].record_id,'size');assert.equal(result.sequence.length,2);
 assert.equal(result.settings_applied,false);
});
test('sequential observer refuses loading, filtered and incomplete grids',()=>{
 for(const change of [f=>f.stores[0].isLoading=()=>true,f=>f.stores[1].getCount=()=>3,f=>f.groups.pop(),f=>f.stores[0].getData=()=>({items:f.sizes,getSource:()=>({items:[...f.sizes,{}]})})])assert.equal(fixture(change).verified,false);
});
test('sequential observer refuses a separate port wizard or an owner change',async()=>{
 const owner={verified:true,surface:'wizard',node_id:'A'},page={evaluate:async()=>({verified:true})};let n=0;
 assert.equal((await readSamplingContext(page,{workflow_ref:{prefix:'x'}},async()=>({...owner,node_id:++n===1?'A':'B'}))).verified,false);
 assert.equal((await readSamplingContext(page,{workflow_ref:{prefix:'x'}},async()=>({...owner,input_port:{port:0}}))).verified,false);
});
