// Closed operator/reviewer oracle. Never import into model input or prompts.
const need=(v,m)=>{if(!v)throw Error('LOGINOM_FP_ORACLE_'+m);};
import {isDeepStrictEqual as equal} from 'node:util';
const baseline=[
 ['RowID','RowID','integer','Непрерывный',0,false],['A','Same','string','Дискретный',0,false],
 ['B','Same','integer','Дискретный',0,false],['C','Unused','boolean','Дискретный',0,false],['Extra','Unrequested','string','Дискретный',0,false],
];
const changed=[baseline[0],['A','Only A','string','Дискретный',0,false],['RenamedB','Same','integer','Неопределенное',6,false],['C','Unused','boolean','Дискретный',0,true],baseline[4]];
const rows=[[101,'alpha',17,true,'keep'],[102,'',0,false,''],[103,null,null,null,null],[104,'semi;colon',-7,true,'Кириллица'],[105,'say "yes"',2147483647,false,'NULL-ish']];
const fields=c=>c.fields.map((f,index)=>{need(f.index===index&&f.caching_method===2,'ORDER_CACHE');return[f.name,f.label,f.type,f.data_kind,f.usage_type,f.excluded]});
export function verifyFieldParametersPreservation({draft,inputTable,outputTable}) {
 need(draft?.kind==='field_parameters_preservation_draft'&&draft.stopped_before_done===true
  &&draft.settings_applied===false&&draft.execution_started===false,'DRAFT_SCOPE');
 need(draft.owner&&['account','package_path','document_id','workflow_id','node_id','session_id','owner','run','lease','chat','admission']
  .every(k=>typeof draft.owner[k]==='string'&&draft.owner[k].length>0)&&Number.isSafeInteger(draft.owner.generation)&&draft.owner.generation>0,'OWNER');
 const before=draft.before?.configuration,after=draft.after?.configuration;
 need(before&&after&&equal(fields(before),baseline)&&equal(fields(after),changed),'SCHEMA');
 need(before.verified===true&&after.verified===true&&before.inventory_complete===true&&after.inventory_complete===true
  &&before.source_identity_verified===true&&after.source_identity_verified===true
  &&[before.node_context,after.node_context].every(n=>n?.verified===true&&['document_id','workflow_id','node_id'].every(k=>n[k]===draft.owner[k])),'NATIVE_CONTEXT');
 need(before.fields.every(f=>typeof f.field_id==='string'&&/^\d+$/.test(f.field_id))&&new Set(before.fields.map(f=>f.field_id)).size===5,'NATIVE_IDS');
 const expected=structuredClone(before.fields);expected[1].label='Only A';expected[2].name='RenamedB';expected[2].usage_type=6;expected[2].data_kind='Неопределенное';expected[3].excluded=true;
 const semantic=fs=>fs.map(({selected,...f})=>f);need(equal(semantic(expected),semantic(after.fields)),'UNLISTED_PROPERTIES');
 need(equal(before.caching,after.caching),'NODE_CACHE');
 need(before.fields.every((f,i)=>f.field_id===after.fields[i].field_id&&f.record_id===after.fields[i].record_id
  &&equal(f.input_field,after.fields[i].input_field)),'PERSISTENT_IDENTITIES');
 const table=(t,expectedColumns,expectedRows)=>{
  need(t?.status==='SUCCEEDED'&&t.cleanup_complete===true&&t.effect_possible===false
   &&t.output?.complete===true&&t.output.port===0,'TABLE_RECEIPT');
  need(['account','package_path','document_id','workflow_id','node_id','session_id','owner','run','lease','generation','chat','admission']
   .every(k=>t.output.binding?.[k]===draft.owner[k]),'TABLE_OWNER');
  need(equal(t.output.columns,expectedColumns)&&equal(t.output.rows,expectedRows),'TABLE_VALUES');
 };
 const cols=xs=>xs.map(([name,label,type])=>({name,label,type}));
 table(inputTable,cols(baseline),rows);
 // A separate observed output receipt is mandatory for values comparison;
 // never project configured columns or unchanged input rows into output proof.
 table(outputTable,cols(changed.filter(f=>!f[5])),rows.map(r=>[r[0],r[1],r[2],r[4]]));
 return {closed_contract_verified:true,native_verified:false,values_are:'caller_supplied_bound_receipts',
  persistence_verified:false,cold_verified:false};
}
