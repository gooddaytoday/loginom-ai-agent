import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {readReplacementBrowser,readReplacementContext} from '../lib/replacement-context.mjs';
function fixture(){
 const all=[],components={},base='MF;TF;WizrdMCF;ReplaceColumnsWizard;';
 const element=(tid,parent=null)=>{const e={id:'e'+all.length,tid,parent,checkVisibility:()=>true,contains(x){return x===this||!!x.parent&&this.contains(x.parent)}};all.push(e);return e;};
 const root=element(base.slice(0,-1)),fields=[{isModel:true,internalId:'f0',data:{Name:'Category',DisplayName:'Same',DataType:5,ReplaceMode:1}},{isModel:true,internalId:'f1',data:{Name:'Other',DisplayName:'Same',DataType:5,ReplaceMode:0}}];
 const pairs=[null,'','Null','null'].map((v,i)=>({isModel:true,internalId:'p'+i,data:{Index:i,CollectionID:0,DataValueType:5,ReplaceByType:5,ValueRender:v,ReplaceRender:'out'+i}}));pairs.push({isModel:true,internalId:'placeholder',data:{Index:0,CollectionID:1}});
 // Native read-only values are independent of the render cache.
 const native=(r,side,render,type)=>({get Value(){return r.data[render];},get IsNull(){return r.data[render]===null;},get DataType(){return r.data[type];}});
 const bind=()=>{for(const r of pairs)if(r.data.CollectionID===0){r.data.DataValue??=native(r,'from','ValueRender','DataValueType');r.data.ReplaceBy??=native(r,'to','ReplaceRender','ReplaceByType');}};bind();
 const proxy=kind=>({$className:kind,pendingOperations:{}}),inputProxy=proxy('bg.ext.CollectionProxy'),pairProxy=proxy('bg.ext.CollectionListProxy');
 const store=(items,p)=>({$className:'Ext.data.Store',getProxy:()=>p,getData:()=>{bind();return {items};},getCount:()=>items.length,isLoading:()=>false,getTotalCount:()=>0});
 const input=store(fields,inputProxy),table=store(pairs,pairProxy),selected=[fields[0]];
 for(const [k,s] of [['grdDataList',input],['grdReplaceItems',table]]){const e=element(base+k,root);components[e.id]={el:{dom:e},getStore:()=>s,getSelectionModel:()=>({getSelection:()=>selected})};}
 const values={cbxReplaceOther:0,chkCaseSensitivity:true,edPrecision:0,edtReplaceOther:'x'};
 for(const k of Object.keys(values)){const e=element(base+k,root);components[e.id]={el:{dom:e},getValue:()=>values[k]};}
 const tableGrid=Object.values(components).find(c=>c.getStore?.()===table);tableGrid.findPlugin=()=>({context:{record:pairs[0]}});
 const masks=[];const context={Ext:{getCmp:id=>components[id]},document:{querySelectorAll:q=>q.startsWith('[data-tid=')?all.filter(e=>e.tid===JSON.parse(q.slice(10,-1))):q.startsWith('.x-mask')?masks:[]}};
 const addControl=(name,properties)=>{const e=element(base+name,root);components[e.id]={el:{dom:e},...properties};};
 return {root,fields,pairs,input,table,inputProxy,pairProxy,selected,values,masks,addControl,read:()=>vm.runInNewContext('('+readReplacementBrowser.toString()+')("MF;TF")',context)};
}
test('real editor separators come from the exact owned local controls',async()=>{
 const f=fixture();f.fields[0].data.DataType=3;
 f.pairs.splice(0,f.pairs.length,{isModel:true,internalId:'p',data:{Index:0,CollectionID:0,DataValueType:3,ReplaceByType:3,ValueRender:1.25,ReplaceRender:9.125}});
 f.addControl('ReplaceEditor;fldVariant;ValueContainer;num',{decimalSeparator:'.'});
 f.addControl('ReplaceEditor-1;fldVariant;ValueContainer;num',{decimalSeparator:','});
 f.addControl('edtReplaceOtherFloat',{decimalSeparator:'.'});
 assert.deepEqual(JSON.parse(JSON.stringify((await f.read()).real_decimal_separators)),{from:'.',to:',',other:'.'});
 const absent=fixture();absent.fields[0].data.DataType=3;absent.pairs.splice(0,absent.pairs.length);
 assert.deepEqual(JSON.parse(JSON.stringify((await absent.read()).real_decimal_separators)),{from:null,to:null,other:null});
});
test('native rules retain NULL, empty and literal null',async()=>{const r=(await fixture().read());assert.equal(r.verified,true);assert.deepEqual(Array.from(r.pairs,p=>p.from.value),[null,'','Null','null']);assert.equal(r.pairs.length,4);assert.equal(r.input_fields[1].name,'Other');});
test('exact Int64 native BigInt is serialized as a decimal string',async()=>{const f=fixture();f.fields[0].data.DataType=4;f.pairs.splice(0,f.pairs.length,{isModel:true,internalId:'p',data:{Index:0,CollectionID:0,DataValueType:4,ReplaceByType:4,ValueRender:1,ReplaceRender:9223372036854775807n}});assert.equal((await f.read()).pairs[0].to.value,'9223372036854775807');});
test('reader refuses loading, pending responses, foreign selection and unsupported rules',async()=>{
 for(const change of [f=>f.table.isLoading=()=>true,f=>f.pairProxy.pendingOperations.x={},f=>f.input.getCount=()=>99,f=>f.selected.splice(0,1,{}),f=>f.pairs[0].data.CollectionID=1,f=>f.pairs[0].data.ReplaceByType=4,f=>f.fields[0].data.ReplaceMode=2,f=>f.values.cbxReplaceOther=3,f=>f.masks.push({checkVisibility:()=>true}),f=>f.fields[1].data.Name='CATEGORY',f=>f.pairs[1].internalId=f.pairs[0].internalId]){const f=fixture();change(f);assert.equal((await f.read()).verified,false);}
});
test('replacement read is bracketed by unchanged node ownership',async()=>{let i=0;const r=await readReplacementContext({evaluate:async()=>({verified:true})},{workflow_ref:{prefix:'MF;TF'}},async()=>({verified:true,surface:'wizard',node_id:++i}));assert.equal(r.verified,false);assert.equal((await readReplacementContext({}, {},async()=>({verified:true,surface:'wizard',output_port:{}}))).verified,false);});

test('server refreshed Int64 words are decoded exactly without object methods',async()=>{for(const [words,expected] of [[{lo:4294967295,hi:2147483647},'9223372036854775807'],[{lo:0,hi:2147483648},'-9223372036854775808']]){const f=fixture();f.fields[0].data.DataType=4;f.pairs.splice(0,f.pairs.length,{isModel:true,internalId:'p',data:{Index:0,CollectionID:0,DataValueType:4,ReplaceByType:4,ValueRender:1,ReplaceRender:words}});assert.equal((await f.read()).pairs[0].to.value,expected);}});

test('cached NULL cannot conceal native string Null on either side',async()=>{for(const side of ['DataValue','ReplaceBy']){const f=fixture();f.pairs[0].data[side]={Value:'Null',IsNull:false,DataType:5};if(side==='ReplaceBy')f.pairs[0].data.ReplaceRender=null;assert.equal((await f.read()).verified,false);}});

test('native value failure and inventory changes refuse verification',async()=>{
 for(const change of [f=>{f.pairs[0].data.DataValue={Value:null,IsNull:false,DataType:5};},f=>{f.pairs[0].data.DataValue={get Value(){throw Error('read failed');}};},f=>{f.pairs[0].data.DataValue={DataType:5,IsNull:true,get Value(){f.selected[0]=f.fields[1];return null;}};}]){const f=fixture();change(f);assert.equal((await f.read()).verified,false);}
});
test('remaining policies keep, null and value survive native pair verification',async()=>{
 for(const mode of [0,1,2]){const f=fixture();f.values.cbxReplaceOther=mode;const r=await f.read();assert.equal(r.verified,true);assert.equal(r.other.mode,['keep','null','value'][mode]);if(mode===2)assert.equal(r.other.value.value,'x');}
});

test('editor proof uses native controllers rather than displayed NULL markers',async()=>{
 for(const value of [null,'','Null','null']){const f=fixture();f.addControl('ReplaceEditor',{Controller:{getValue:()=>value}});f.addControl('ReplaceEditor-1',{Controller:{getValue:()=>value}});const r=await f.read();assert.equal(r.verified,true);assert.equal(r.editor_values.from.value,value);assert.equal(r.editor_values.to.value,value);}
 const f=fixture();f.addControl('ReplaceEditor',{getValue:()=>null});f.addControl('ReplaceEditor-1',{getValue:()=>null});assert.equal((await f.read()).verified,false);
});

test('native await cannot replace either bound proxy or change input inventory/metadata',async()=>{
 for(const side of ['DataValue','ReplaceBy']){const f=fixture();if(side==='ReplaceBy')f.pairs[0].data.ReplaceRender=null;f.pairs[0].data[side]={DataType:5,IsNull:true,Value:Promise.resolve().then(()=>{f.pairs[0].data[side]={DataType:5,IsNull:false,Value:'Null'};return null;})};assert.equal((await f.read()).verified,false);}
 for(const change of [f=>f.fields.push({isModel:true,internalId:'new',data:{Name:'Added',DisplayName:'Added',DataType:5,ReplaceMode:0}}),f=>f.fields[0].data.DisplayName='changed',f=>f.fields[0].data.DataType=4,f=>f.fields[0].data.ReplaceMode=0,f=>f.fields[0].data={...f.fields[0].data},f=>f.pairs[0].data.Index=42,f=>f.pairs[0].data.DataValueType=4,f=>f.pairs[0].data={...f.pairs[0].data},f=>f.pairs.push({...f.pairs[0],internalId:'new'})]){const f=fixture();f.pairs[0].data.DataValue={DataType:5,IsNull:true,Value:Promise.resolve().then(()=>{change(f);return null;})};assert.equal((await f.read()).verified,false);}
});
