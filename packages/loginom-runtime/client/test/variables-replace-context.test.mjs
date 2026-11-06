import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {readVariablesReplaceBrowser,readVariablesReplaceContext} from '../lib/variables-replace-context.mjs';
function fixture(){
 const all=[],components={},base='MF;TF;WizrdMCF;ReplaceVariablesWizard;';
 const element=(tid,parent=null)=>{const e={id:'e'+all.length,tid,parent,checkVisibility:()=>true,contains(x){return x===this||!!x.parent&&this.contains(x.parent)}};all.push(e);return e;};
 const root=element(base.slice(0,-1)),fields=[{isModel:true,internalId:'f0',data:{Name:'Category',DisplayName:'Same',DataType:5,ReplaceMode:1}},{isModel:true,internalId:'f1',data:{Name:'Other',DisplayName:'Same',DataType:5,ReplaceMode:0}}];
 const pairs=[null,'','null'].map((v,i)=>({isModel:true,internalId:'p'+i,data:{Index:i,CollectionID:0,DataValueType:5,ReplaceByType:5,ValueRender:v,ReplaceRender:'out'+i}}));pairs.push({isModel:true,internalId:'placeholder',data:{Index:0,CollectionID:1}});
 // Accessing server proxies is forbidden even if it appears convenient.
 for(const r of pairs)Object.defineProperty(r.data,'DataValue',{get(){throw Error('remote getter');}});
 const proxy=kind=>({$className:kind,pendingOperations:{}}),inputProxy=proxy('bg.ext.CollectionProxy'),pairProxy=proxy('bg.ext.CollectionListProxy');
 const store=(items,p)=>({$className:'Ext.data.Store',getProxy:()=>p,getData:()=>({items}),getCount:()=>items.length,isLoading:()=>false,getTotalCount:()=>0});
 const input=store(fields,inputProxy),table=store(pairs,pairProxy),selected=[fields[0]];
 for(const [k,s] of [['grdDataList',input],['grdReplaceItems',table]]){const e=element(base+k,root);components[e.id]={el:{dom:e},getStore:()=>s,getSelectionModel:()=>({getSelection:()=>selected})};}
 const values={cbxReplaceOther:0,chkCaseSensitivity:true,edPrecision:0,edtReplaceOther:'x'};
 for(const k of Object.keys(values)){const e=element(base+k,root);components[e.id]={el:{dom:e},getValue:()=>values[k]};}
 const target={type:null,badIcon:false},button=element(base+'btnTypeChange',root),icon=element(base+'icon',root);
 components[button.id]={el:{dom:button},btnIconEl:{dom:icon},get iconCls(){return 'bg-TBGDataType-'+({2:'dtDateTime',3:'dtFloat',4:'dtInteger',5:'dtString'}[target.type??fields[0].data.DataType]);}};
 icon.classList={contains:value=>!target.badIcon&&value===components[button.id].iconCls};
 const masks=[];const context={Date,Ext:{getCmp:id=>components[id]},document:{querySelectorAll:q=>q.startsWith('[data-tid=')?all.filter(e=>e.tid===JSON.parse(q.slice(10,-1))):q.startsWith('.x-mask')?masks:[]}};
 const addControl=(name,properties)=>{const e=all.find(e=>e.tid===base+name)??element(base+name,root);components[e.id]={el:{dom:e},...properties};};
 return {root,fields,pairs,input,table,inputProxy,pairProxy,selected,values,masks,target,addControl,read:()=>vm.runInNewContext('('+readVariablesReplaceBrowser.toString()+')("MF;TF")',context)};
}
test('Boolean replacement is read from typed cached records without coercion or proxy getters',()=>{
 const f=fixture();f.fields[0].data.DataType=1;f.pairs.splice(0,f.pairs.length,{isModel:true,internalId:'b',data:{Index:0,CollectionID:0,DataValueType:1,ReplaceByType:1,ValueRender:true,ReplaceRender:false}});
 const r=f.read();assert.equal(r.verified,true);assert.equal(r.pairs[0].from.value,true);assert.equal(r.pairs[0].to.value,false);
 f.pairs[0].data.ReplaceRender=0;assert.equal(f.read().verified,false);
});
test('NULL and empty string stay distinct, pending proxies and duplicate inputs refuse',()=>{
 const f=fixture(),r=f.read();assert.equal(r.verified,true);assert.equal(r.pairs[0].from.value,null);assert.equal(r.pairs[1].from.value,'');
 f.pairProxy.pendingOperations.x=true;assert.equal(f.read().verified,false);delete f.pairProxy.pendingOperations.x;
 f.fields[1].data.Name='Category';assert.equal(f.read().verified,false);
});
test('context reads refuse owner drift and separate port wizards',async()=>{
 let i=0;const r=await readVariablesReplaceContext({evaluate:async()=>({verified:true})},{workflow_ref:{prefix:'MF;TF'}},async()=>({verified:true,surface:'wizard',node_id:++i}));assert.equal(r.verified,false);
 assert.equal((await readVariablesReplaceContext({}, {},async()=>({verified:true,surface:'wizard',output_port:{}}))).verified,false);
});
