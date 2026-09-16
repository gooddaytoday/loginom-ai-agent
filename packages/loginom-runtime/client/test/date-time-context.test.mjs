import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readDateTimeBrowser,readDateTimeContext} from '../lib/date-time-context.mjs';
function fixture(change=()=>{}){
 const prefix='MF;TF-1',base=prefix+';WizrdMCF;DateReformWizard',root={checkVisibility:()=>true,contains:e=>grids.includes(e)},grids=[{id:'fields'},{id:'functions'}];
 const field={isModel:true,internalId:'field-A',data:{Name:'A',DisplayName:'Дата',DataType:2,Count:1}};
 const records=[...Array.from({length:19},(_,Func)=>({Func,ISO8601:false})),...[0,1,2,4,5,6,7,8,10,18].map(Func=>({Func,ISO8601:true}))].map((d,i)=>({isModel:true,internalId:'function-'+i,data:{...d,DoDateTimeFirst:false,DoDateTimeLast:false,DoNumber:!d.ISO8601&&d.Func===4,DoString:false,StringFmt:''}}));
 const store=items=>({$className:'Ext.data.Store',getData:()=>({items}),getCount:()=>items.length,isLoading:()=>false});
 const stores=[store([field]),store(records)],selection=[field];
 change({field,records,stores,selection});
 const context=vm.createContext({document:{querySelectorAll:s=>{const tid=JSON.parse(s.slice(10,-1));return tid===base?[root]:tid===base+';grdColumns'?[grids[0]]:tid===base+';grdDataFormat'?[grids[1]]:[];}},Ext:{getCmp:id=>{const i=grids.findIndex(g=>g.id===id);return {el:{dom:grids[i]},getStore:()=>stores[i],getSelectionModel:()=>({getSelection:()=>selection})};}}});
 return JSON.parse(JSON.stringify(vm.runInContext('('+readDateTimeBrowser.toString()+')',context)(prefix)));
}
test('native date matrix reads complete selected cache without dereferencing Functions',()=>{
 const result=fixture(({field})=>Object.defineProperty(field.data,'Functions',{get(){throw Error('remote proxy accessed');}}));
 assert.equal(result.verified,true);assert.equal(result.matrix.length,29);assert.equal(result.selected.name,'A');assert.equal(result.settings_applied,false);
});
test('native date matrix distinguishes cached counters and refuses partial stores or ambiguous selection',()=>{
 const stale=fixture(f=>f.field.data.Count++);assert.equal(stale.native_count_consistent,false);assert.equal(stale.selected_count,1);
 for(const change of [f=>f.records.pop(),f=>f.selection.push(f.field),f=>f.stores[1].isLoading=()=>true,f=>f.stores[1].getCount=()=>100,f=>f.field.data.DataType=0,f=>f.records[0].data.Func=4,f=>f.records[0].data.DoNumber=1])assert.equal(fixture(change).verified,false);
});
test('native date list permits only the complete built-in datetime filter',()=>{
 const filtered=extra=>fixture(f=>{f.stores[0].getData=()=>({items:[f.field],getSource:()=>({items:[f.field,extra]})});});
 assert.equal(filtered({data:{DataType:1,Name:'Amount'}}).verified,true);
 assert.equal(filtered({data:{DataType:2,Name:'HiddenDate'}}).verified,false);
});
test('date matrix read refuses owner drift and separate port forms',async()=>{
 const owner={verified:true,surface:'wizard',node_id:'A'},page={evaluate:async()=>({verified:true,inventory_complete:true})};let reads=0;
 assert.equal((await readDateTimeContext(page,{workflow_ref:{prefix:'x'}},async()=>({...owner,node_id:++reads===1?'A':'B'}))).verified,false);
 assert.equal((await readDateTimeContext(page,{workflow_ref:{prefix:'x'}},async()=>({...owner,input_port:{port:0}}))).verified,false);
});
