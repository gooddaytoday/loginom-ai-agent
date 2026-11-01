import test from 'node:test';
import assert from 'node:assert/strict';
import {configureBinningOutputs} from '../lib/binning-output.mjs';
const owner={document_id:'doc',workflow_id:'flow',node_id:'binning',verified:true};
const configuration={node_context:owner,field:'X',type:'real',fields:[{name:'RowID',label:'RowID',type:'integer',data_kind:'Непрерывный'},{name:'X',label:'X',type:'real',data_kind:'Непрерывный'},{name:'Note',label:'Note',type:'string',data_kind:'Дискретный'}]};
// Native DerivedDataSourceOutputSocketWizard inventory at LAB-654 count-c:340.
const names=[
 [['RowID','integer'],['X','real'],['X_BinsID','string'],['X_Number','integer'],['X_Label','string'],['X_LowBound','real'],['X_UppBound','real'],['X_LowBoundIncl','boolean'],['X_UppBoundIncl','boolean'],['X_LowLimOpen','boolean'],['X_UppLimOpen','boolean'],['X_OutOfBins','integer'],['Note','string']],
 [['BinsID','string'],['BoundsDataType','integer'],['Number','integer'],['LowBound','real'],['UppBound','real'],['Label','string'],['LowBoundQuota','real'],['UppBoundQuota','real'],['BinQuota','real'],['LowDev','real'],['UppDev','real'],['LowLimitOpen','boolean'],['UppLimitOpen','boolean']],
];
function fixture(change=()=>{},{closeDelay=0}={}){
 let s,port,closing=0,closeSamples=0;const calls=[];
 const closed=()=>{s.wizard={status:'absent'};s.prepared_node_context={...owner,surface:'graph',locked:false};s.ui.elements=[];};
 const channel={
  async openOutputPort(p){assert.equal(closing,0,'previous output Close must finish first');port=p;calls.push('open:'+p);
   const n={...owner,surface:'wizard',output_port:{direction:'output',port:p,native_index:p,port_guid:'port-'+p,opening_operation_id:'open-'+p,node_icon_class:'bg-vendor-icon-binning'}};
   const fields=names[p].map(([name,type],index)=>({name,type,index,label:name,data_kind:['string','boolean'].includes(type)?'Дискретный':'Непрерывный',excluded:false,source:null}));
   s={prepared_node_context:n,node_mapping:{verified:true,inventory_complete:true,mapping_wizard:'DerivedDataSourceOutputSocketWizard',source_identity_verified:false,source_fields:[],target_fields:fields,node_context:n},
    wizard:{status:'observed',stage:'output_mapping',root_tid:'W',root_ref:'wizard',port_context:{status:'observed',kind:'output_data',node:{ref:'node'},port:{ref:'port'}}},ui:{elements:[{tid:'W;btnClose',ref:'close',allowed_actions:['click']}],masks:[],dialogs:[]}};
   change(s);
  },
  async observe(o){
   if(o.outputColumnPage){const {offset,limit}=o.outputColumnPage,all=s.node_mapping.target_fields,fields=all.slice(offset,offset+limit).map(f=>({...f,status:'observed'}));
    s.wizard.output_columns={fields,page:{status:'complete_definition_page',schema_id:'schema-'+port,offset,limit,total_columns:all.length,returned:fields.length,next_offset:offset+fields.length===all.length?null:offset+fields.length}};
   }
   while(!o.ready(s)&&closing>0){await new Promise(resolve=>setImmediate(resolve));closeSamples++;if(--closing===0)closed();}
   assert.ok(o.ready(s),o.condition);return structuredClone(s);
  },
  async perform(o){assert.ok(o.ready(s));assert.deepEqual(o.resolve(s),{verb:'click',ref:'close'});calls.push('close:'+port);closing=closeDelay;if(!closing)closed();},
 };
 return {calls,get closeSamples(){return closeSamples;},run:()=>configureBinningOutputs(channel,configuration,{},[])};
}
test('derived Binning output definitions have no mapping source rows and are inspected without commit',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.verified,true);assert.deepEqual(r.ports.map(p=>p.schema.map(f=>f.name)),names.map(fs=>fs.map(([n])=>n)));
 assert.deepEqual(f.calls,['open:0','close:0','open:1','close:1']);
});
test('derived output inspection awaits asynchronous Close before opening the next port',async()=>{
 const f=fixture(undefined,{closeDelay:3}),r=await f.run();
 assert.equal(r.verified,true);assert.equal(f.closeSamples,6);assert.deepEqual(f.calls,['open:0','close:0','open:1','close:1']);
});
test('derived output inspection refuses foreign owners/ports and incomplete, reordered or mistyped schemas',async()=>{
 for(const change of [s=>s.node_mapping.node_context.node_id='other',s=>s.node_mapping.node_context.output_port.port=1,
  s=>s.node_mapping.node_context.output_port.node_icon_class='bg-vendor-icon-other',s=>s.node_mapping.node_context.output_port.port_guid='',
  s=>s.node_mapping.mapping_wizard='TuneDataSourceMappingWizard',s=>s.node_mapping.source_fields=[{}],
  s=>s.node_mapping.target_fields.reverse(),s=>s.node_mapping.target_fields[1].type='integer',s=>s.node_mapping.target_fields.pop(),s=>s.node_mapping.target_fields[1].excluded=true]){
  const f=fixture(change);await assert.rejects(f.run(),/Binning output:/);assert.deepEqual(f.calls,['open:0']);
 }
});
