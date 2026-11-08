import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {validateVariablesColumnUnionParameters} from '../lib/variables-coluniondatavar-parameters.mjs';
import {readVariablesColumnUnionMapping,readVariablesColumnUnionSourceEditor} from '../lib/variables-column-union-procedure.mjs';
import {variablesColumnUnionConfigurationReadback} from '../lib/variables-coluniondatavar-readback.mjs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {nodeApplyResultSchema} from '../lib/node-result-schema.mjs';

const parameters=()=>({column_union:{mapping:'manual',fields:[
 {input:1,source:'amount',name:'right_amount',label:'Правая сумма',type:'integer'},
 {input:0,source:'amount',name:'left_text',label:'Левая сумма текстом',type:'string'},
]}});
test('manual union accepts an ordered complete selection with names, labels and declared types',()=>{
 validateVariablesColumnUnionParameters(parameters(),'append_variables');
});
test('manual creation rejects the native auto-renaming default caption before preparing any graph effect',()=>{
 const request={target:{kind:'new',label:'Соединение (переменные)'},inputs:[],mappings:[],variable_inputs:[0,1].map(input=>({kind:'variables',input,source:{node_id:'s'+input}})),read:{ports:[],variable_ports:[0]}};
 assert.throws(()=>validateVariablesColumnUnionParameters(parameters(),'append_variables',request),/omit target.label/);
 delete request.target.label;validateVariablesColumnUnionParameters(parameters(),'append_variables',request);
 request.target.label='User union';validateVariablesColumnUnionParameters(parameters(),'append_variables',request);
});
test('manual production readback fits the public result and refuses wrong order or conversion metadata',()=>{
 const node={document_id:'d',workflow_id:'w',node_id:'u'},fields=parameters().column_union.fields;
 const phase=(phase,value)=>({phase,status:'verified',receipt_id:'op:'+phase,value:{verified:true,...value}});
 const phases=[phase('input_mapping',{inputs:[0,1].map(input=>({kind:'variables',input,output:0,source:{...node,node_id:'s'+input},source_port_guid:'s'+input,target_port_guid:'u'+input})),source_fields:[0,1].map(input=>({input,name:'amount',label:'amount',type:'integer'}))}),
  phase('configure',{configuration:{mapping:'manual',inventory_complete:true,node_context:{...node,verified:true},fields}}),phase('finish',{settings_applied:true}),phase('read',{variable_ports:[{variables:fields.map(({name,label,type})=>({name,label,type}))}]})];
 const read=()=>variablesColumnUnionConfigurationReadback({node,phases,operation_id:'op'}),r=read();
 const validate=new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema.properties.configuration.properties.readback);
 assert.equal(validate(r).valid,true);
 phases[3].value.variable_ports[0].variables.reverse();assert.throws(read,/manual output differs/);
});

function mappingFixture(){
 const base='MF;TF;WizrdMCF;DerivedVariablesMappingEngineOutputPortWizard',elements=new Map(),components=new Map();
 const element=tid=>{const el={id:tid,checkVisibility:()=>true};elements.set(tid,el);return el;};
 const root=element(base);root.contains=e=>[...elements.values()].includes(e);
 const add=(key,properties)=>{const el=element(base+';'+key);components.set(el.id,{el:{dom:el},...properties});};
 const record=(ID,Name,DataType)=>({internalId:'r'+ID,isModel:true,data:{ID,Name,DisplayName:Name,DataType}});
 const sources=[record(0,'amount',4),record(1,'empty',5),record(2,'amount_1',4),record(3,'enabled',1)],targets=[record(4,'right_amount',4),record(5,'left_text',5)];
 for(const [t,index] of targets.map((t,i)=>[t,[2,0][i]])){t.data.ConnectedRecord=sources[index];sources[index].data.ConnectedRecord=t;}
 const stores=[sources,targets].map(rows=>({$className:'Ext.data.Store',getData:()=>({items:rows}),getCount:()=>rows.length,isLoading:()=>false,getProxy:()=>({pendingOperations:{}})}));
 add('btnAutoSyncThroughColumns',{pressed:false});add('rbTable',{getValue:()=>true});
 ['grdSourceColumns','grdTargetColumns'].forEach((k,i)=>add(k,{getStore:()=>stores[i]}));
 const document={querySelectorAll:q=>{const tid=JSON.parse(q.slice(10,-1));return elements.has(tid)?[elements.get(tid)]:[];}};
 return {sources,targets,stores,read:()=>vm.runInNewContext('('+readVariablesColumnUnionMapping.toString()+')("MF;TF")',{document,Ext:{getCmp:id=>components.get(id)}})};
}
test('manual mapping reads complete reciprocal local records, ordered sources and conversion without remote getters',()=>{
 const f=mappingFixture();for(const r of [...f.sources,...f.targets])Object.defineProperty(r.data,'$self',{get(){assert.fail('remote variable read');}});
 const result=f.read();assert.equal(result.verified,true);assert.equal(result.mapping,'manual');
 assert.deepEqual(Array.from(result.fields,f=>[f.name,f.source_index,f.type]),[['right_amount',2,'integer'],['left_text',0,'string']]);
});
test('manual mapping refuses filtered, loading, unsupported and nonreciprocal records',()=>{
 for(const change of [f=>f.stores[0].isLoading=()=>true,f=>f.sources[0].data.ConnectedRecord=null,
  f=>f.targets[0].data.DataType=2,f=>f.stores[1].getCount=()=>99,
  f=>f.stores[0].getData=()=>({items:f.sources,getSource:()=>({items:[...f.sources,{}]})})]){
  const f=mappingFixture();change(f);assert.equal(f.read().verified,false);
 }
});
test('source editor uses native isXType, binds its active record and selects duplicate labels by native identity',()=>{
 const base='MF;TF;WizrdMCF;DerivedVariablesMappingEngineOutputPortWizard',elements=new Map(),components=new Map();
 const add=(suffix,properties)=>{const tid=base+';'+suffix,el={id:tid,checkVisibility:()=>true,getAttribute:key=>key==='data-tid'?tid:null};elements.set(tid,el);const cmp={el:{dom:el},...properties};components.set(tid,cmp);return cmp;};
 const sources=[0,1].map(i=>({isModel:true,internalId:'s'+i,data:{Name:'amount',ID:i}}));
 const options=sources.map(source=>({data:{Value:source,DisplayName:'amount'}}));
 const option={getAttribute:key=>key==='data-tid'?base+';editor;boundlist;amount':key==='data-recordindex'?'1':null};
 const combo=add('editor',{isXType:type=>type==='combobox',isExpanded:true,picker:{el:{dom:{checkVisibility:()=>true}},getStore:()=>({getData:()=>({items:options})}),getNode:r=>r===options[1]?option:null,getRecord:()=>options[1]}});
 const plugin={context:{record:{internalId:'target'},column:{dataIndex:'SourceDisplayName'}},activeEditor:{field:combo}};
 add('grdTargetColumns',{findPlugin:()=>plugin});add('grdSourceColumns',{getStore:()=>({getData:()=>({items:sources})})});
 const document={querySelectorAll:q=>q==='[data-tid]'?[...elements.values()]:(()=>{const t=JSON.parse(q.slice(10,-1));return elements.has(t)?[elements.get(t)]:[];})()};
 const read=source_index=>vm.runInNewContext('('+readVariablesColumnUnionSourceEditor.toString()+')(task)',{document,Ext:{getCmp:id=>components.get(id)},task:{base,record:'target',source_index}});
 assert.equal(combo.isComboBox,undefined);assert.equal(read().verified,true);assert.equal(read().expanded,true);
 assert.equal(read(1).index,1);plugin.context.record.internalId='foreign';assert.throws(()=>read(1),/owner changed/);
});
test('manual union refuses ambiguous sources, duplicate names, unsupported types and incomplete fields before mutation',()=>{
 for(const change of [p=>p.column_union.fields=[],p=>p.column_union.fields[0].input=2,
  p=>p.column_union.fields[0].type='datetime',p=>delete p.column_union.fields[0].source,
  p=>p.column_union.fields[1].name='RIGHT_AMOUNT',p=>p.column_union.fields[0].extra=true,
  p=>p.column_union.fields.push({...p.column_union.fields[0],name:'other'}),
  p=>p.column_union.mapping='automatic']){
  const p=parameters();change(p);assert.throws(()=>validateVariablesColumnUnionParameters(p,'append_variables'));
 }
});
