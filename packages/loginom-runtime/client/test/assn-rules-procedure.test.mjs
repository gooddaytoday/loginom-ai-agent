import test from 'node:test';
import assert from 'node:assert/strict';
import {bindAssnRulesAuxiliary} from '../lib/assn-rules-procedure.mjs';

test('auxiliary roles bind field IDs, order, types and complete upstream source identity',()=>{
 const node_context={verified:true,document_id:'doc',workflow_id:'flow',node_id:'rules'};
 const field={field_id:'42',index:0,name:'Item',label:'Элемент',type:'string',data_kind:'Дискретный',usage_type:0};
 const source={record_id:'source-1',field_id:'42',name:'Item',label:'Элемент',type:'string'};
 const configuration={verified:true,inventory_complete:true,node_context,fields:[field]};
 const input={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'TuneDataSourceMappingWizard',
  node_context:{...node_context,input_port:{port:1}},target_fields:[{...field,source}],source_fields:[source]};
 const result=bindAssnRulesAuxiliary(configuration,input);
 assert.equal(result.source_identity_verified,true);assert.equal(result.fields[0].input_field.source_field_id,'42');
 for(const change of [i=>i.node_context.node_id='foreign',i=>i.node_context.input_port.port=0,i=>i.inventory_complete=false,
  i=>i.source_identity_verified=false,i=>i.target_fields[0].field_id='43',i=>i.target_fields[0].index=1,
  i=>i.target_fields[0].type='integer',i=>i.target_fields[0].source={...i.target_fields[0].source,record_id:'foreign'}]){
  const wrong=structuredClone(input);change(wrong);assert.throws(()=>bindAssnRulesAuxiliary(configuration,wrong),/auxiliary/);
 }
});
