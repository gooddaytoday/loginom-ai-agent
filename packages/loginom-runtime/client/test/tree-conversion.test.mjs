import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {validateTreeConversionParameters,validateTableTreeSource,validateSerializationTree,tableToTreeParametersSchema,treeToJsonParametersSchema} from '../lib/tree-conversion-parameters.mjs';
import {createTreeConversionNodeSupport} from '../lib/tree-conversion-node.mjs';
import {nodeApplyInputSchema} from '../lib/node-api.mjs';
import {validateActionParameters} from '../lib/action-catalog.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {NODE_TYPES,describeNodeTypes} from '../lib/node-contracts.mjs';
import {userNodeTool} from '../lib/user-workflow.mjs';
import {nodeApiTools} from '../lib/node-api.mjs';
const nodes=JSON.parse(await readFile(new URL('../../../../docs/node-development/nodes/trees-datatotree/fixtures/structure.json',import.meta.url))).nodes;
const request={target:{kind:'new',type:'trees.from_table'},inputs:[{input:0,output:0}],mappings:[]};
async function conversionImplementation(table){
 const source=await readFile(new URL('../lib/tree-conversion-node.mjs',import.meta.url),'utf8');
 const factory=vm.runInNewContext(source.replace(/^import .*;$/gm,'').replaceAll('export ','')+';createTreeConversionNodeSupport',{
  createTabularTransformNodeSupport:(_config,implementation)=>implementation,
  tableToTreeParametersSchema,treeToJsonParametersSchema,validateTreeConversionParameters,validateTableTreeSource,validateSerializationTree,structuredClone,
 });
 return factory({}, {table});
}
test('table-tree validates the complete declared schema and typed source before mutation',()=>{
 validateTreeConversionParameters({nodes},'manual_structure',request);
 const schema=nodes.filter(n=>n.source_field).map(n=>({name:n.source_field,type:n.type}));
 const port={sample_complete:true,row_count:3,schema,sample:Array.from({length:3},()=>schema.map(c=>({type:c.type,is_null:true,value:null})))};
 validateTableTreeSource(port,nodes);
 for(const change of [n=>n[2].path='/items/0/RowID',n=>n[1].is_array=false,n=>n[0].source_field='RowID',n=>n[2].type='datetime',n=>n[2].label='other',n=>n.push({...n[2]})]){
  const bad=structuredClone(nodes);change(bad);assert.throws(()=>validateTreeConversionParameters({nodes:bad},'manual_structure',request));
 }
 assert.throws(()=>validateTableTreeSource({...port,schema:schema.map(c=>({...c,type:'string'}))},nodes));
 assert.throws(()=>validateTableTreeSource({...port,row_count:100},nodes));
 assert.throws(()=>validateTreeConversionParameters({},'manual_structure',request));
 validateTreeConversionParameters({},'manual_structure',{...request,target:{...request.target,kind:'existing'},inputs:[]});
});
test('serialization accepts only the approved settings and retains omitted existing settings',()=>{
 const r={...request,target:{kind:'new',type:'trees.to_json'}};
 const p={exclude_root:true,pretty:false,keys:'names',multi_row:false,datetime:'iso8601'};
 validateTreeConversionParameters(p,'serialize',r);
 for(const [key,value] of Object.entries({exclude_root:false,pretty:true,keys:'labels',multi_row:true,datetime:'local'}))assert.throws(()=>validateTreeConversionParameters({...p,[key]:value},'serialize',r));
 assert.throws(()=>validateTreeConversionParameters({},'serialize',r));
 validateTreeConversionParameters({},'serialize',{...r,target:{...r.target,kind:'existing'},inputs:[]});
});
test('new types install their actual handlers and preserve the sorting/join keys schema',()=>{
 const support=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'});
 for(const type of ['trees.from_table','trees.to_json'])assert.ok(support.nodeApplyHandlers.has(type));
 assert.equal(NODE_TYPES['trees.from_table'].tree_outputs,1);
 assert.deepEqual(NODE_TYPES['trees.to_json'].input_kinds,['tree']);
 for(const keys of ['names',[{field:{kind:'input_field',name:'ID'},direction:'ASC'}],[{left:'ID',right:'Key'}]])validateActionParameters(nodeApplyInputSchema.properties.parameters,{keys});
 const validate=new AjvJsonSchemaValidator().getValidator(nodeApplyInputSchema.properties.parameters);
 assert.equal(validate({keys:'labels'}).valid,false);
 assert.equal(validate({keys:'names'}).valid,true);
 const compact=userNodeTool(nodeApiTools.find(t=>t.name==='dock_node_apply'));
 assert.ok(Buffer.byteLength(JSON.stringify(compact.inputSchema))<=20000);
 for(const type of ['trees.from_table','trees.to_json']){
  const cards=describeNodeTypes([type],{},new Map(),support.nodeApplyHandlers);
  assert.ok(Buffer.byteLength(JSON.stringify(cards[0]))<=12000);
 }
});

test('serialization refuses an unsupported omitted saved setting before changing it',async()=>{
 const implementation=await conversionImplementation(false),actions=[];
 const state={prepared_node_context:{verified:true,surface:'wizard'},wizard:{stage:'tree_json',root_tid:'W'},
  node_tree:{verified:true,inventory_complete:true,base:'W;',exclude_root:true,pretty:true,keys:'names',multi_row:false,datetime:'iso8601'},
  ui:{elements:[{tid:'W;btnNext',ref:'next',allowed_actions:['wizard_step']},{tid:'W;pedPrettifyJSON;ValueControl;DisplayEl',ref:'pretty',allowed_actions:['click']}]}};
 const channel={observe:async options=>{assert.ok(options.ready(state));return structuredClone(state);},perform:async options=>{
  const action=options.resolve(state);actions.push(action);
  if(action.ref==='pretty')state.node_tree.pretty=false;
  if(action.ref==='next')state.wizard.stage='done';
 }};
 await assert.rejects(implementation.configure(channel,{}, {request:{target:{kind:'existing',type:'trees.to_json'},inputs:[],mappings:[],finish:'execute'}}),/Unsupported retained serialization pretty/);
 assert.deepEqual(actions,[]);assert.equal(state.node_tree.pretty,true);
});

test('existing table conversion retains its last verified settings after a later output read',async()=>{
 const source={node_id:'source',workflow_id:'wf',document_id:'doc'},target={node_id:'target',workflow_id:'wf',document_id:'doc'};
 const request={document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'Scenario'}]},target:{kind:'existing',type:'trees.from_table',ref:target},
  parameters:{},inputs:[{input:0,output:0,source}],mappings:[]};
 const schema=nodes.filter(n=>n.source_field).map(n=>({name:n.source_field,type:n.type}));
 const port={port:0,port_guid:'port',fresh:true,sample_complete:true,execution_id:'exec',row_count:3,schema,sample:[[],[],[]]};
 const done=output=>({cleanup_confirmed:true,outcome:{status:'SUCCEEDED',cleanup_complete:true,output:{cleanup_complete:true,...output}}});
 const history=[done({node:target,configuration:{readback:{kind:'table_to_tree',nodes}}}),done({node:target}),
  done({node:source,execution:{status:'completed',execution_id:'exec'},output:{ports:[port]}})];
 const support=createTreeConversionNodeSupport({targetOrigin:'http://example.test',targetBuild:'7.4.2'},{table:true});
 const driver=support.nodeApplyDriverFactory({operation:{id:'op',parameters:request,nodeTargetAdapter:{observe:async()=>({nodes:[],links:[]})}},
  execute:async()=>({verified:true,ports:[{index:0,active:true,port_guid:'port'}]}),nodeHistory:()=>history,onRecord:async e=>e});
 assert.equal((await driver.beforeTarget({deadline:Date.now()+10000})).verified,true);
});

test('replacement maps newly created unbound leaves without opening Clear Links confirmation',async()=>{
 const implementation=await conversionImplementation(true),wanted=structuredClone(nodes.slice(0,3));
 const tree={verified:true,inventory_complete:true,base:'W;',nodes:structuredClone(wanted).map(n=>({...n,...(n.source_field?{source_field:'old'}:{})})),source_fields:[{name:'RowID',type:'integer',tid:'source'}]};
 const state={prepared_node_context:{verified:true,surface:'wizard'},wizard:{stage:'table_tree',root_tid:'W'},node_tree:tree,ui:{elements:[]}};
 let selected='';const actions=[];
 const control=(tid,verbs=['click'])=>({tid,ref:tid,allowed_actions:verbs});
 const render=()=>{
  tree.nodes.forEach((n,i)=>Object.assign(n,{tid:n.path+';TreeText',delete_tid:n.path+';Delete',parent:i===0?null:tree.nodes.findIndex(p=>p.path===n.path.slice(0,n.path.lastIndexOf('/')))}));
  state.ui.elements=[control('W;btnNext',['wizard_step']),control('W;btnAddChild'),control('source',['drag']),
   ...tree.nodes.flatMap(n=>[control(n.tid,['click','drag']),control(n.delete_tid)]),...(tree.delete_confirmation?[control('msgbox;tlb;yes')]:[])];
  if(tree.editor)state.ui.elements.push(...['edtName','edtDisplayName'].map(k=>control('EditDataTreeNodeDefForm;'+k,['fill','press'])),
   ...['cbxDataType;trg_picker','cbxDataType;boundlist;Целый','chbIsContainer;DisplayEl','chbIsArray;DisplayEl','btnApply'].map(k=>control('EditDataTreeNodeDefForm;'+k)));
 };
 const channel={observe:async options=>{render();assert.ok(options.ready(state),options.condition);return structuredClone(state);},perform:async options=>{
  const a=options.resolve(state);actions.push(a);const e=tree.editor;
  if(a.verb==='wizard_step')state.wizard.stage='done';
  else if(a.verb==='drag')tree.nodes.find(n=>n.tid===a.target_ref).source_field='RowID';
  else if(a.ref.endsWith(';TreeText'))selected=tree.nodes.find(n=>n.tid===a.ref).path;
  else if(a.ref.endsWith(';Delete'))tree.delete_confirmation={path:selected};
  else if(a.ref==='msgbox;tlb;yes'){tree.nodes=tree.nodes.filter(n=>n.path!==selected&&!n.path.startsWith(selected+'/'));delete tree.delete_confirmation;}
  else if(a.ref==='W;btnAddChild')tree.editor={add:true,name:'',label:'',type:'string',is_container:false,is_array:false};
  else if(a.verb==='fill')e[a.ref.endsWith(';edtName')?'name':'label']=a.text;
  else if(a.ref.endsWith(';boundlist;Целый'))e.type='integer';
  else if(a.ref.endsWith(';chbIsContainer;DisplayEl'))e.is_container=!e.is_container;
  else if(a.ref.endsWith(';chbIsArray;DisplayEl'))e.is_array=!e.is_array;
  else if(a.ref.endsWith(';btnApply')){tree.nodes.push({path:selected+'/'+e.name,name:e.name,label:e.label,type:e.is_container?'object':e.type,is_array:e.is_array,...(!e.is_container?{source_field:''}:{})});delete tree.editor;}
 }};
 const result=await implementation.configure(channel,{nodes:wanted},{request:{...request,finish:'execute'}});
 assert.equal(result.verified,true);assert.equal(tree.nodes[2].source_field,'RowID');
 assert.equal(actions.some(a=>a.ref==='W;btnClearLinks'),false);
});
