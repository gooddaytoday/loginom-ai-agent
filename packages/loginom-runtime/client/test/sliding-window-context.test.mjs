import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readSlidingWindowBrowser,readSlidingWindowContext} from '../lib/sliding-window-context.mjs';
function fixture(change=()=>{}){
 const base='MF;TF-1;WizrdMCF;SlidingWindowWizard;',root={checkVisibility:()=>true,contains:()=>true};
 const record={isModel:true,internalId:'Sales-1',data:{Name:'Sales',DisplayName:'Продажи',DataType:4,History:3,Forecast:1}};
 const records=[record],store={$className:'Ext.data.Store',getData:()=>({items:records}),getCount:()=>records.length,isLoading:()=>false};
 const input={value:'Оставлять неполные записи'},grid={id:'grid'},history={id:'history'},horizon={id:'horizon'},policy={id:'policy',querySelectorAll:()=>[input]};
 const nodes=new Map([[base.slice(0,-1),root],[base+'grdColumns',grid],[base+'colHistory',history],[base+'colForecast',horizon],[base+'pedIncompleteRecordsProcessing;ValueControl',policy]]);
 const components={grid:{el:{dom:grid},getStore:()=>store},history:{el:{dom:history},dataIndex:'History'},horizon:{el:{dom:horizon},dataIndex:'Forecast'},policy:{el:{dom:policy}}};
 change({record,records,store,input,nodes,base});
 const context=vm.createContext({document:{querySelectorAll:s=>{const t=JSON.parse(s.slice(10,-1));return nodes.has(t)?[nodes.get(t)]:[];}},Ext:{getCmp:id=>components[id]}});
 return JSON.parse(JSON.stringify(vm.runInContext('('+readSlidingWindowBrowser.toString()+')',context)('MF;TF-1')));
}
test('window reader inventories cached rows and exact native policy',()=>{
 const result=fixture();assert.equal(result.verified,true);assert.equal(result.incomplete_records,'keep_incomplete');
 assert.deepEqual(result.fields.map(f=>[f.name,f.type,f.history,f.horizon]),[['Sales','integer',3,1]]);
 for(const change of [f=>f.store.isLoading=()=>true,f=>f.store.getCount=()=>2,f=>f.records.push(f.record),f=>f.record.data.Forecast=-1,f=>f.record.data.DataType=6,f=>f.input.value='unknown',f=>f.nodes.set(f.base+'pedIncompleteRecordsProcessing;SwitchButton',{classList:{contains:()=>true}})])assert.equal(fixture(change).verified,false);
});
test('window context rejects changed node or separate port before using configuration',async()=>{
 let count=0;const owner={verified:true,surface:'wizard',node_id:'A'},page={evaluate:async()=>({verified:true})},binding={workflow_ref:{prefix:'x'}};
 assert.equal((await readSlidingWindowContext(page,binding,async()=>({...owner,node_id:++count===1?'A':'B'}))).verified,false);
 assert.equal((await readSlidingWindowContext(page,binding,async()=>({...owner,input_port:{port:0}}))).verified,false);
});
