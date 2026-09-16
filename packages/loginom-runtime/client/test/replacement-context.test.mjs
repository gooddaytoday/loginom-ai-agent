import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {readReplacementBrowser,readReplacementContext} from '../lib/replacement-context.mjs';
function fixture(){
 const all=[],components={},base='MF;TF;WizrdMCF;ReplaceColumnsWizard;';
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
 const masks=[];const context={Ext:{getCmp:id=>components[id]},document:{querySelectorAll:q=>q.startsWith('[data-tid=')?all.filter(e=>e.tid===JSON.parse(q.slice(10,-1))):q.startsWith('.x-mask')?masks:[]}};
 return {root,fields,pairs,input,table,inputProxy,pairProxy,selected,values,masks,read:()=>vm.runInNewContext('('+readReplacementBrowser.toString()+')("MF;TF")',context)};
}
test('cached rules retain Null, empty and literal null without invoking remote getters',()=>{const r=fixture().read();assert.equal(r.verified,true);assert.deepEqual(Array.from(r.pairs,p=>p.from.value),[null,'','null']);assert.equal(r.pairs.length,3);assert.equal(r.input_fields[1].name,'Other');});
test('exact Int64 native BigInt is serialized as a decimal string',()=>{const f=fixture();f.fields[0].data.DataType=4;f.pairs.splice(0,f.pairs.length,{isModel:true,internalId:'p',data:{Index:0,CollectionID:0,DataValueType:4,ReplaceByType:4,ValueRender:1,ReplaceRender:9223372036854775807n}});assert.equal(f.read().pairs[0].to.value,'9223372036854775807');});
test('reader refuses loading, pending responses, foreign selection and unsupported rules',()=>{
 for(const change of [f=>f.table.isLoading=()=>true,f=>f.pairProxy.pendingOperations.x={},f=>f.input.getCount=()=>99,f=>f.selected.splice(0,1,{}),f=>f.pairs[0].data.CollectionID=1,f=>f.pairs[0].data.ReplaceByType=4,f=>f.fields[0].data.ReplaceMode=2,f=>f.values.cbxReplaceOther=3,f=>f.masks.push({checkVisibility:()=>true}),f=>f.fields[1].data.Name='CATEGORY',f=>f.pairs[1].internalId=f.pairs[0].internalId]){const f=fixture();change(f);assert.equal(f.read().verified,false);}
});
test('replacement read is bracketed by unchanged node ownership',async()=>{let i=0;const r=await readReplacementContext({evaluate:async()=>({verified:true})},{workflow_ref:{prefix:'MF;TF'}},async()=>({verified:true,surface:'wizard',node_id:++i}));assert.equal(r.verified,false);assert.equal((await readReplacementContext({}, {},async()=>({verified:true,surface:'wizard',output_port:{}}))).verified,false);});

test('server refreshed Int64 words are decoded exactly without object methods',()=>{for(const [words,expected] of [[{lo:4294967295,hi:2147483647},'9223372036854775807'],[{lo:0,hi:2147483648},'-9223372036854775808']]){const f=fixture();f.fields[0].data.DataType=4;f.pairs.splice(0,f.pairs.length,{isModel:true,internalId:'p',data:{Index:0,CollectionID:0,DataValueType:4,ReplaceByType:4,ValueRender:1,ReplaceRender:words}});assert.equal(f.read().pairs[0].to.value,expected);}});
