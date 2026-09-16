import {nativeCellSchema,nativePortProperties} from './variant-native-schema.mjs';
// Public result data, including partial effects. Validation is not an independent
// acceptance audit: a valid schema alone never proves the user's goal complete.
const str={type:'string'},bool={type:'boolean'},integer={type:'integer',minimum:0};
const values=(...enumValues)=>({type:'string',enum:enumValues});
const object=(properties,required=Object.keys(properties),additionalProperties=false)=>({type:'object',properties,required,additionalProperties});
const array=items=>({type:'array',items});
const nullable=schema=>({anyOf:[schema,{type:'null'}]});
const ref=object({document_id:str,workflow_id:str,node_id:str});
const error=object({code:str,message:str,cause:object({code:str,message:str})},['code','message']);
const phase=values('validate','source','workflow','target','input_mapping','open','configure','node_finish','output_mapping','finish','execute','read');
const execution={anyOf:[object({status:values('not_requested','pending','completed','cancelled'),execution_id:nullable(str),stop_verified:bool},['status','execution_id']),
 object({status:values('failed'),execution_id:str,failure_verified:{type:'boolean',const:true},root_id:str,group_id:str,group_record_id:str})]};
const receipt=object({phase,receipt_id:str,status:values('pending','verified','not_requested'),effect_possible:bool});
const legacyCell=object({type:str,is_null:bool,value:{type:['string','number','boolean','null']},decimal:str,
 representation:str,precision:{type:'string',pattern:'^(?!exact_native$)'},display_text:str,timezone:str},['type','is_null','precision']);
const cell={anyOf:[legacyCell,nativeCellSchema]};
const column=object({index:integer,name:str,label:str,type:str,header_tid:str,data_kind:str},['index','name','label','type'],true);
const port=object({...nativePortProperties,port:integer,port_guid:str,fresh:bool,freshness_basis:str,execution_id:str,
 table:object({view_guid:str,port_guid:str,table_tid:str}),schema:array(column),row_count:integer,
 sample:{type:'array',items:array(cell),maxItems:10},sample_rows:{type:'integer',minimum:0,maximum:10},sample_complete:bool,
 precision:object({numbers_verified:bool,limitations:array(str),strings:str}),table_schema_id:str,filter_enabled:bool},
 ['port','port_guid','fresh','execution_id','schema','row_count','sample','sample_rows','sample_complete','precision'],true);
export const nodeOutputPortSchema=port;
const fileArtifact=object({artifact_id:str,destination:str,bytes:integer,sha256:{type:'string',pattern:'^[a-f0-9]{64}$'},execution_id:str,verification_id:str,
 freshness_basis:values('explicit_replace_and_completed_native_execution','native_absence_check_and_completed_execution')});
const output=object({status:values('not_refreshed','partial','complete'),evidence_ref:nullable(str),execution_id:str,ports:array(port),file_artifacts:{...array(fileArtifact),maxItems:1},
 verified:bool,cleanup_complete:bool,effect_possible:bool,no_output_requested:bool},['status','evidence_ref'],true);
const readbackColumn=object({index:integer,name:str,label:str,type:str,data_kind:str,used:bool});
const readbackMappingField=object({index:integer,name:str,label:str,type:str,data_kind:str,source_name:str});
const boundedFields=items=>({...array(items),maxItems:1000});
const importConfigurationReadback=object({kind:values('text_import'),scope:values('observed_before_verified_finish'),node:ref,
 receipt_ids:{...array(str),minItems:3,maxItems:3},values_are:values('observed_ui_values'),
 source:object({source_path:str,connection:str,encoding:str,rows_to_skip:str,first_line_as_title:bool}),
 format:object({delimiter:str,text_qualifier:str,null_marker:str,decimal_separator:str}),
 columns:boundedFields(readbackColumn),output_mapping:object({port:{type:'integer',const:0},autosync:bool,fields:boundedFields(readbackMappingField)}),
 package_persistence_verified:{type:'boolean',const:false}});
const calculatorConfigurationReadback=object({kind:values('calculator'),scope:values('observed_before_verified_finish'),node:ref,
 receipt_ids:{...array(str),minItems:5,maxItems:5},values_are:values('observed_ui_values'),mode:values('expression'),
 expressions:{...array(object({index:integer,name:str,label:str,type:str,formula:str,replace:bool,intermediate:bool,cached:bool,description:str})),minItems:1,maxItems:128},
 input_mapping:object({port:{type:'integer',const:0},autosync:bool,fields:boundedFields(object({...readbackMappingField.properties,excluded:bool}))}),
 input_fields:boundedFields(object({name:str,label:str,type:str})),syntax_validation:values('accepted_by_loginom_next'),
 output_mapping:object({port:{type:'integer',const:0},autosync:bool,fields:boundedFields(object({...readbackMappingField.properties,excluded:bool}))}),
 package_persistence_verified:{type:'boolean',const:false}});
const groupingConfigurationReadback=object({kind:values('grouping'),scope:values('observed_before_verified_finish'),node:ref,
 receipt_ids:{...array(str),minItems:5,maxItems:5},values_are:values('observed_ui_values'),mode:values('aggregate'),
 group_by:{...array(object({name:str,label:str,type:str,order:integer})),minItems:1,maxItems:128},
 measures:{...array(object({name:str,label:str,type:str,order:integer,functions:integer})),minItems:1,maxItems:256},
 options:object({pedDimCache:object({value:bool,switch_pressed:bool}),pedSortResult:object({value:bool,switch_pressed:bool})}),
 input_mapping:object({port:{type:'integer',const:0},autosync:bool,fields:boundedFields(readbackMappingField)}),
 output_mapping:object({port:{type:'integer',const:0},autosync:bool,fields:boundedFields(object({...readbackMappingField.properties,excluded:bool}))}),
 package_persistence_verified:{type:'boolean',const:false}});
const sortingConfigurationReadback=object({kind:values('sorting'),scope:values('observed_before_verified_finish'),node:ref,
 receipt_ids:{...array(str),minItems:5,maxItems:5},values_are:values('observed_ui_values'),mode:values('keys'),
 keys:{...array(object({name:str,label:str,type:str,order:integer,direction:values('ASC','DESC'),case_sensitive:bool})),minItems:1,maxItems:128},
 options:object({chkLocaleAware:object({value:bool,switch_pressed:bool}),chkBufferWhole:object({value:bool,switch_pressed:bool}),cbxMaxThreadCount:object({value:integer,switch_pressed:bool})}),
 comparison:object({mode:values('binary','user_locale'),locale:nullable(str),locale_verified:bool,case_insensitivity:values('latin_only','locale_dependent')}),
 input_mapping:object({port:{type:'integer',const:0},autosync:bool,fields:boundedFields(readbackMappingField)}),
 output_mapping:object({port:{type:'integer',const:0},autosync:bool,fields:boundedFields(object({...readbackMappingField.properties,excluded:bool}))}),
 package_persistence_verified:{type:'boolean',const:false}});
const replacementValue=object({type:values('string','integer','real'),value:{type:['string','number','null']}});
const replacementRule=object({field:object({kind:values('input_field'),name:str}),type:values('string','integer','real'),pairs:{...array(object({from:replacementValue,to:replacementValue})),maxItems:256},other:object({mode:values('keep','null','value'),value:replacementValue},['mode']),case_sensitive:bool,precision:{const:0}},['field','type','pairs','other']);
const replacementConfigurationReadback=object({kind:values('replacement'),scope:values('observed_before_verified_finish'),node:ref,
 receipt_ids:{...array(str),minItems:5,maxItems:5},values_are:values('observed_ui_values'),mode:values('exact'),
 rules:{...array(replacementRule),minItems:1,maxItems:128},output_mode:values('replace','add'),
 input_mapping:object({port:{type:'integer',const:0},autosync:bool,fields:boundedFields(readbackMappingField)}),
 output_mapping:object({port:{type:'integer',const:0},autosync:bool,fields:boundedFields(object({...readbackMappingField.properties,excluded:bool}))}),
 package_persistence_verified:{type:'boolean',const:false}});
const collapseConfigurationReadback=object({kind:values('collapse'),scope:values('observed_before_verified_finish'),node:ref,
 receipt_ids:{...array(str),minItems:5,maxItems:5},values_are:values('observed_ui_values'),mode:values('unpivot'),
 information:{...array(object({name:str,label:str,type:str,order:integer})),maxItems:128},
 transposed:{...array(object({name:str,label:str,type:str,order:integer})),minItems:1,maxItems:128},ignore_empty:bool,
 input_mapping:object({port:{type:'integer',const:0},autosync:bool,fields:boundedFields(readbackMappingField)}),
 output_mapping:object({port:{type:'integer',const:0},autosync:bool,fields:boundedFields(object({...readbackMappingField.properties,excluded:bool}))}),
 package_persistence_verified:{type:'boolean',const:false}});
const reformConfigurationReadback=object({kind:values('field_parameters'),scope:values('observed_before_verified_finish'),node:ref,
 receipt_ids:{...array(str),minItems:5,maxItems:5},values_are:values('observed_ui_values'),
 fields:boundedFields(object({index:integer,field_id:str,name:str,label:str,type:str,data_kind:str,
  usage_type:{type:'integer',enum:[0,3,4,6,7,8,9]},caching_method:{type:'integer',minimum:0,maximum:2},excluded:bool,
  input_field:object({field_id:str,name:str,label:str,type:str,index:integer,source_name:str,source_field_id:str})})),
 caching:object({value:{type:'integer',minimum:0,maximum:3},display:str,variable:bool}),
 preservation:object({unrequested_fields:bool,unrequested_properties:bool,caching:bool}),
 input_mapping:object({port:{type:'integer',const:0},autosync:bool,fields:boundedFields(object({...readbackMappingField.properties,field_id:str}))}),
 output_mapping:object({port:{type:'integer',const:0},autosync:bool,fields:boundedFields(object({...readbackMappingField.properties,excluded:bool}))}),
 package_persistence_verified:{type:'boolean',const:false}});
const filterConfigurationReadback=object({kind:values('row_filter'),scope:values('observed_before_verified_finish'),node:ref,
 receipt_ids:{...array(str),minItems:5,maxItems:5},values_are:values('observed_ui_values'),groups:{type:'array',minItems:1,maxItems:64,items:{type:'array',minItems:1,maxItems:128,items:{type:'object'}}},
 input_mapping:object({port:{type:'integer',const:0},autosync:bool,fields:boundedFields(readbackMappingField)}),
 output_mappings:{...array(object({port:{type:'integer',minimum:0,maximum:1},autosync:bool,fields:boundedFields(object({...readbackMappingField.properties,excluded:bool}))})),minItems:2,maxItems:2},
 package_persistence_verified:{type:'boolean',const:false}});
const joinConfigurationReadback=object({kind:values('join'),scope:values('observed_before_verified_finish'),node:ref,
 receipt_ids:{...array(str),minItems:5,maxItems:5},values_are:values('observed_ui_values'),mode:values('inner','left'),
 keys:{...array(object({left:str,right:str})),minItems:1,maxItems:1000},case_sensitive:bool,include_joined_keys:bool,
 input_mappings:{...array(object({port:{type:'integer',minimum:0,maximum:1},autosync:bool,fields:boundedFields(readbackMappingField)})),minItems:2,maxItems:2},
 output_mapping:object({port:{type:'integer',const:0},autosync:bool,fields:boundedFields(object({...readbackMappingField.properties,excluded:bool}))}),
 package_persistence_verified:{type:'boolean',const:false}});
const unionConfigurationReadback=object({kind:values('union'),scope:values('observed_before_verified_finish'),node:ref,
 receipt_ids:{...array(str),minItems:5,maxItems:5},values_are:values('observed_ui_values'),mode:values('append_all'),
 prefixes:object({enabled:bool,name:str,label:str}),tables:{...array(object({port:{type:'integer',minimum:1,maximum:14},fields:boundedFields(object({source:str,main:nullable(str)}))})),minItems:1,maxItems:14},
 input_mappings:{...array(object({port:{type:'integer',minimum:0,maximum:14},autosync:bool,fields:boundedFields(readbackMappingField)})),minItems:2,maxItems:15},
 output_mapping:object({port:{type:'integer',const:0},autosync:bool,fields:boundedFields(object({...readbackMappingField.properties,excluded:bool}))}),
 package_persistence_verified:{type:'boolean',const:false}});
const exportConfigurationReadback=object({kind:values('text_export'),scope:values('observed_before_verified_finish'),node:ref,
 receipt_ids:{...array(str),minItems:3,maxItems:3},values_are:values('observed_ui_values'),destination:str,settings:object({destination:str,text_qualifier:values('"'),decimal_separator:values('.',','),date_separator:str,time_separator:str,true_value:str,false_value:str,null_marker:str,date_format:str,time_format:str,delimiter:values(';',',','\t'),encoding:{type:'integer',const:65001},bom:bool,line_ending:{type:'integer',enum:[0,1]},header:{type:'integer',enum:[0,1,2]}}),input_mapping:object({port:{type:'integer',const:0},autosync:bool,fields:boundedFields(readbackMappingField)}),package_persistence_verified:{type:'boolean',const:false}});
const missingValuesThreshold={type:'integer',minimum:0,maximum:100};
const disabled={type:'boolean',const:false};
const missingValuesField={name:str,label:str,type:str,data_kind:str};
const missingValuesConfigurationReadback=object({kind:values('missing_values'),scope:values('observed_before_verified_finish'),node:ref,
 receipt_ids:{...array(str),minItems:5,maxItems:5},values_are:values('observed_ui_values'),mode:values('impute'),
 fields:{...boundedFields({anyOf:[
  object({...missingValuesField,used:disabled}),
  object({...missingValuesField,type:values('integer','real'),data_kind:values('Непрерывный'),used:{type:'boolean',const:true},method:values('mean')}),
  object({...missingValuesField,type:values('string'),data_kind:values('Дискретный'),used:{type:'boolean',const:true},method:values('constant'),value:str}),
 ]}),minItems:1},ordered:disabled,max_nulls_percent:missingValuesThreshold,
 options:object({pedUseQuality:object({value:disabled,switch_pressed:disabled}),pedOrderedSample:object({value:disabled,switch_pressed:disabled}),
  pedMaxNullsPercent:object({value:missingValuesThreshold,switch_pressed:disabled}),
  'RandSeedEdit;edtRandSeed':object({value:{type:'string',maxLength:32},switch_pressed:disabled})}),
 input_mapping:object({port:{type:'integer',const:0},autosync:bool,fields:boundedFields(readbackMappingField)}),
 output_mapping:object({port:{type:'integer',const:0},autosync:bool,fields:boundedFields(object({...readbackMappingField.properties,excluded:bool}))}),
 package_persistence_verified:disabled});
const dateTimeConfigurationReadback=object({kind:values('date_time'),scope:values('observed_before_verified_finish'),node:ref,
 receipt_ids:{...array(str),minItems:5,maxItems:5},values_are:values('observed_ui_values'),mode:values('calendar'),
 fields:{...boundedFields(object({name:str,matrix:{...array(object({index:integer,record_id:str,func:{type:'integer',minimum:0,maximum:18},iso:bool,
  first:bool,last:bool,number:bool,string:bool,string_format:str})),minItems:29,maxItems:29}})),minItems:1},
 input_mapping:object({port:{type:'integer',const:0},autosync:bool,fields:boundedFields(readbackMappingField)}),
 output_mapping:object({port:{type:'integer',const:0},autosync:bool,fields:boundedFields(object({...readbackMappingField.properties,excluded:bool}))}),
 package_persistence_verified:{type:'boolean',const:false}});
const duplicatesConfigurationReadback=object({kind:values('duplicates'),scope:values('observed_before_verified_finish'),node:ref,
 receipt_ids:{...array(str),minItems:5,maxItems:5},values_are:values('observed_ui_values'),
 fields:boundedFields(object({index:integer,field_id:str,name:str,label:str,type:str,data_kind:str,
  usage_type:{type:'integer',enum:[0,3,4]},
  input_field:object({field_id:str,name:str,label:str,type:str,index:integer,source_name:str,source_field_id:str})})),
 input_mapping:object({port:{type:'integer',const:0},fields:boundedFields(object({name:str,source_name:str}))}),
 output_mapping:object({port:{type:'integer',const:0},fields:boundedFields(object({name:str,label:str,type:str,source_name:str}))}),
 package_persistence_verified:{type:'boolean',const:false}});
const configurationReadback={anyOf:[exportConfigurationReadback,collapseConfigurationReadback,missingValuesConfigurationReadback,dateTimeConfigurationReadback,replacementConfigurationReadback,importConfigurationReadback,calculatorConfigurationReadback,groupingConfigurationReadback,sortingConfigurationReadback,reformConfigurationReadback,filterConfigurationReadback,joinConfigurationReadback,unionConfigurationReadback,duplicatesConfigurationReadback]};
export const nodeApplyResultSchema=object({operation_id:str,status:values('SUCCEEDED','FAILED','NOT_APPLIED','AMBIGUOUS'),
 effect_possible:bool,phases:array(receipt),node:nullable(ref),execution,output,
 package_saved:{type:'boolean',const:false},cleanup_complete:bool,warnings:array(str),
 configuration:object({status:values('applied','discarded'),readback:configurationReadback},['status']),
 checkpoint_kind:values('local_node_checkpoint','local_node_cancellation','local_node_stopped','local_node_failed'),
 persisted_package_verified:{type:'boolean',const:false},pending_phase:nullable(phase),error},
 ['operation_id','status','effect_possible','phases','node','execution','output','package_saved','cleanup_complete','warnings']);
const outcome=object({status:values('SUCCEEDED','FAILED','NOT_APPLIED','AMBIGUOUS'),action_key:{type:'string',const:'node.apply'},
 action_revision:str,operation_id:str,phase:str,effect_possible:bool,cleanup_complete:bool,
 output:nodeApplyResultSchema,error:nullable(error),trace:array({type:'object'})});
const progress=object({node:nullable(ref),execution,accepted_phases:array(phase),pending_phase:nullable(phase),effect_possible:bool,cleanup_complete:bool});
export const nodeJobResultSchema=object({operation_id:str,attempt:{type:'integer',minimum:1},state:values('running','settled'),
 cancel_requested:bool,server_stop_requested:bool,progress:nullable(progress),outcome:nullable(outcome),error:nullable(error)});
export const deliveryJobResultSchema=object({operation_id:str,state:values('running','settled'),phase:str,upload_operation_id:str,
 outcome:nullable(object({status:values('SUCCEEDED','FAILED','NOT_APPLIED','AMBIGUOUS'),upload_operation_id:str,
  destination:str,bytes:integer,sha256:str,verification_id:str,cleanup_complete:bool,upload_completion_verified:bool,
  code:str,effect_possible:bool},['status'],true)),error:nullable(object({code:str,message:str},['message'],true))});
