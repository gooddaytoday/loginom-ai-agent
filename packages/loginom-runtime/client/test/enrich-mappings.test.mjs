import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {configureEnrichInputs,effectiveEnrichInput} from '../lib/enrich-mappings.mjs';
import {validateEnrichSchemas} from '../lib/enrich-parameters.mjs';

test('enrich input mapping retains graph source identities separately from local field records',async()=>{
 const ref=node_id=>({document_id:'doc',workflow_id:'wf',node_id});
 const node=ref('enrich'),main=ref('main'),lookup=ref('lookup');
 const graph={complete:true,nodes:[{ref:node,type:'transform.enrich_data',inputs:[0,1]},
  {ref:main,outputs:[0]},{ref:lookup,outputs:[0]}],links:[
  {source:main.node_id,output:0,target:node.node_id,input:0},
  {source:lookup.node_id,output:0,target:node.node_id,input:1},
 ]};
 const fields=names=>names.map((name,index)=>({name,label:name,type:'integer',data_kind:'Дискретный',index,record_id:'field-'+name}));
 const mappings=[fields(['Key','Amount']),fields(['Key','Value'])].map((fs,port)=>({verified:true,inventory_complete:true,source_identity_verified:true,autosync:false,mapping_wizard:'TuneDataSourceMappingWizard',
  source_fields:fs,target_fields:fs.map(f=>({...f,source:f})),node_context:{verified:true,...node,input_port:{port,native_index:port,port_guid:'port-'+port}}}));
 let current=0;
 const channel={openInputPort:async port=>{current=port;},observe:async({ready})=>{
  const state={wizard:{stage:'input_mapping'},node_mapping:mappings[current]};assert.ok(ready(state));return state;
 }};
 // Replace only the separate UI definition reader and Close. The complete
 // production mapping procedure resolves and returns the real graph sources.
 const configure=vm.runInNewContext('('+configureEnrichInputs.toString()+')',{
  structuredClone,need:(ok,message)=>{if(!ok)throw Error(message);},effectiveEnrichInput,validateEnrichSchemas,
  schema:fields=>fields.map(({name,label,type})=>({name,label,type})),
  closePreparedWizard:async()=>{},readOutputDefinitionPages:async()=>({fields:mappings[current].target_fields}),
 });
 const request={parameters:{enrichment:{prefixes:{enabled:false,name:'',label:''},tables:[{port:1,keys:[{main:'Key',lookup:'Key'}]}]}},mappings:[]};
 const result=await configure(channel,[],{},request,async()=>({settings_applied:true}),{graph,node});
 assert.deepEqual(JSON.parse(JSON.stringify(result.ports.map(p=>p.source))),[{node:main,output:0},{node:lookup,output:0}]);
});
