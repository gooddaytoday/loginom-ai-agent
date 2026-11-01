import {nativeCellSchema,nativePortProperties} from './variant-native-schema.mjs';
// Public result data, including partial effects. Validation is not an independent
// acceptance audit: a valid schema alone never proves the user's goal complete.
const str={type:'string'},bool={type:'boolean'},integer={type:'integer',minimum:0};
const values=(...enumValues)=>({type:'string',enum:enumValues});
const object=(properties,required=Object.keys(properties),additionalProperties=false)=>({type:'object',properties,required,additionalProperties});
const array=items=>({type:'array',items});
const nullable=schema=>({anyOf:[schema,{type:'null'}]});
const ref=object({document_id:str,workflow_id:str,node_id:str});
const javascriptNativeError=object({kind:values('javascript_wizard'),stage:values('code_next','done'),node:ref,
 source_sha256:{type:'string',pattern:'^[a-f0-9]{64}$'},tooltip:{type:'string',maxLength:2048},tooltip_truncated:bool,
 dialog_text:{type:'string',maxLength:2048},dialog_text_truncated:bool,dialog_closed:{type:'boolean',const:true},
 error_class:{anyOf:[object({status:values('unrecognized')}),object({status:values('recognized'),
  name:values('SyntaxError','TypeError','ReferenceError','RangeError','EvalError','URIError','Error')})]},
 location:{anyOf:[object({status:values('unrecognized')}),object({status:values('recognized'),
  line:{type:'integer',minimum:1},column:{type:'integer',minimum:1}})]},
 technical_details:object({text:{type:'string',maxLength:2048},truncated:bool,expanded:{type:'boolean',const:true}})},
 ['kind','stage','node','source_sha256','tooltip','tooltip_truncated','dialog_text','dialog_text_truncated','dialog_closed','error_class','location']);
const error=object({code:str,message:str,cause:object({code:str,message:str}),native:javascriptNativeError},['code','message']);
const phase=values('validate','source','workflow','target','input_mapping','open','configure','node_finish','materialization_start','materialization_execute','output_mapping','finish','execute','read');
const execution={anyOf:[object({status:values('not_requested','pending','completed','cancelled','unknown'),execution_id:nullable(str),stop_verified:bool},['status','execution_id']),
 object({status:values('failed'),execution_id:str,failure_verified:{type:'boolean',const:true},root_id:str,group_id:str,group_record_id:str})]};
const receipt=object({phase,receipt_id:str,status:values('pending','verified','not_requested'),effect_possible:bool});
const legacyCell=object({type:str,is_null:bool,value:{type:['string','number','boolean','null']},decimal:str,
 representation:str,precision:{type:'string',pattern:'^(?!exact_native$)'},display_text:str,timezone:str},['type','is_null','precision']);
const cell={anyOf:[legacyCell,nativeCellSchema]};
const column=object({index:integer,name:str,label:str,type:str,header_tid:str,data_kind:str},['index','name','label','type'],true);
const port=object({...nativePortProperties,port:integer,port_guid:str,fresh:bool,freshness_basis:str,execution_id:str,
 table:object({view_guid:str,port_guid:str,table_tid:str}),schema:array(column),row_count:integer,
 sample:{type:'array',items:array(cell),maxItems:100},sample_rows:{type:'integer',minimum:0,maximum:100},sample_complete:bool,
 precision:object({numbers_verified:bool,limitations:array(str),strings:str}),table_schema_id:str,filter_enabled:bool},
 ['port','port_guid','fresh','execution_id','schema','row_count','sample','sample_rows','sample_complete','precision'],true);
const treeSchemaNode=object({index:integer,parent:nullable(integer),path:str,name:str,label:str,type:str,is_container:bool,is_array:bool,children:array(integer)});
const treeInstance=object({index:integer,parent:nullable(integer),schema_index:integer,path:str,type:str,children:array(integer),
 is_null:bool,value:{type:['string','number','boolean','null']},precision:str,representation:str,decimal:str},['index','parent','schema_index','path','type']);
const treePort=object({port:integer,port_guid:str,port_kind:values('tree'),fresh:bool,freshness_basis:values('completed_execution_port_source'),execution_id:str,
 tree:object({schema:{...array(treeSchemaNode),minItems:1,maxItems:256},instances:{...array(treeInstance),minItems:1,maxItems:256},
 complete:{const:true},node_count:{type:'integer',minimum:1,maximum:256},max_depth:{type:'integer',minimum:0,maximum:16},
 limits:object({max_nodes:{const:256},max_depth:{const:16},max_bytes:{const:1048576}})}),sample_complete:{const:true}});
export const nodeOutputPortSchema=port;
export const nodeTreeOutputPortSchema=treePort;
const fileArtifact=object({artifact_id:str,destination:str,bytes:integer,sha256:{type:'string',pattern:'^[a-f0-9]{64}$'},execution_id:str,verification_id:str,
 freshness_basis:values('explicit_replace_and_completed_native_execution','native_absence_check_and_completed_execution')});
const output=object({status:values('not_refreshed','partial','complete'),evidence_ref:nullable(str),execution_id:str,ports:array({anyOf:[port,treePort]}),file_artifacts:{...array(fileArtifact),maxItems:1},
 verified:bool,cleanup_complete:bool,effect_possible:bool,no_output_requested:bool,
 javascript_source:object({source_operation_id:str,source_sha256:{type:'string',pattern:'^[a-f0-9]{64}$'},
  source_utf8_bytes:{type:'integer',minimum:0,maximum:32768},source_lf_lines:{type:'integer',minimum:1,maximum:1024},
  settings_sha256:{type:'string',pattern:'^[a-f0-9]{64}$'},policy:values('javascript-module-v1')})},['status','evidence_ref'],true);
const readbackColumn=object({index:integer,name:str,label:str,type:str,data_kind:str,used:bool});
const readbackMappingField=object({index:integer,name:str,label:str,type:str,data_kind:str,source_name:str});
const boundedFields=items=>({...array(items),maxItems:1000});
const importConfigurationReadback=object({kind:values('text_import'),scope:values('observed_before_verified_finish'),node:ref,
 receipt_ids:{...array(str),minItems:3,maxItems:3},values_are:values('observed_ui_values'),
 source:object({source_path:str,connection:str,encoding:str,rows_to_skip:str,first_line_as_title:bool}),
 format:object({delimiter:str,text_qualifier:str,null_marker:str,decimal_separator:str,multiple_delimiters:bool,date_format:str,date_separator:str},['delimiter','text_qualifier','null_marker','decimal_separator']),
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
const regexReplacementValue=object({type:values('string'),value:str});
const regexReplacementRule=object({field:object({kind:values('input_field'),name:str}),type:values('string'),pairs:{...array(object({from:regexReplacementValue,to:regexReplacementValue})),minItems:1,maxItems:256},other:object({mode:values('keep','null')})});
const regexReplacementConfigurationReadback=object({...replacementConfigurationReadback.properties,mode:values('regex'),rules:{...array(regexReplacementRule),minItems:1,maxItems:128}});
const convertedReplacementValueSchema=object({type:values('string','integer','real','datetime'),value:{type:['string','number','null']}});
const convertedReplacementRuleSchema=object({...replacementRule.properties,result_type:values('string','integer','real','datetime'),pairs:{type:'array',items:object({from:convertedReplacementValueSchema,to:convertedReplacementValueSchema}),maxItems:256},other:object({mode:values('keep','null','value'),value:convertedReplacementValueSchema},['mode'])},['field','type','pairs','other']);
const convertedReplacementConfigurationReadback=object({...replacementConfigurationReadback.properties,rules:{type:'array',items:convertedReplacementRuleSchema,minItems:1,maxItems:128}});
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
 receipt_ids:{...array(str),minItems:5,maxItems:5},values_are:values('observed_ui_values'),mode:values('inner','left','right','full','difference'),
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
const excelExportConfigurationReadback=object({kind:values('excel_export'),scope:values('observed_before_verified_finish'),node:ref,receipt_ids:{...array(str),minItems:3,maxItems:3},values_are:values('observed_ui_values'),destination:str,settings:object({destination:str,sheet_name:str,file_type:{const:1},header:{type:'integer',enum:[0,1,2]},number_format:{const:0},decimal_count:{type:'number'},divide_thousands:{const:false}}),input_mapping:object({port:{const:0},autosync:bool,fields:boundedFields(readbackMappingField)}),package_persistence_verified:{const:false}});
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
const smoothingConfigurationReadback=object({kind:values('smoothing'),scope:values('observed_before_verified_finish'),node:ref,
 receipt_ids:{type:'array',items:str,minItems:5,maxItems:5},values_are:values('observed_ui_values'),mode:values('hodrick_prescott'),
 smoothing:{type:'array',items:object({field:str,lambda:{type:'number'},period:{type:'number'},strength:values('lambda','period')}),maxItems:128},
 output_port:{type:'integer',const:0},fields:{type:'array',items:object({name:str,label:str,type:str,source_field:str,smoothed:bool,excluded:bool}),maxItems:1000},package_persistence_verified:disabled});
const slidingWindowConfigurationReadback=object({kind:values('sliding_window'),scope:values('observed_before_verified_finish'),node:ref,
 receipt_ids:{type:'array',items:str,minItems:5,maxItems:5},values_are:values('observed_ui_values'),mode:values('lag'),
 incomplete_records:values('keep_incomplete','drop_added','drop_all_incomplete'),windows:{type:'array',items:object({field:str,history:integer,horizon:integer}),maxItems:1000},
 output_port:{type:'integer',const:0},fields:{type:'array',items:object({name:str,label:str,type:str,source_field:str,offset:{type:'integer'},excluded:bool}),maxItems:1000},package_persistence_verified:disabled});
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
const crossTableCategoryField=object({category:nullable(str),category_kind:values('null','other','value'),fact:str,function:values('sum','count','min','max','avg','stddev','sum_squares','unique_count','null_count','first','last'),field:str,label:str,type:str,categories:array(object({dimension:str,caption:str,kind:values('null','other','value'),value:nullable(str)})),reserved_possible:bool,category_identity_source:values('observed_caption')},['category','category_kind','fact','function','field','label','type']);
const crossTableConfigurationReadback=object({kind:values('crosstable'),scope:values('observed_before_verified_finish'),values_are:values('observed_ui_values'),node:ref,
 receipt_ids:{...array(str),minItems:5,maxItems:7},mode:values('pivot'),category_mode:values('fixed','sliding'),
 row_keys:{...array(object({name:str,label:str,type:str,order:integer})),maxItems:128},column:nullable(object({name:str,label:str,type:str})),columns:{...array(object({name:str,label:str,type:str,order:integer})),maxItems:128},
 facts:{...array(object({name:str,label:str,type:values('integer','real','string','boolean','datetime','variant'),order:integer,functions:{...array(values('sum','count','min','max','avg','stddev','sum_squares','unique_count','null_count','first','last')),minItems:1,maxItems:11}})),minItems:1,maxItems:128},
 options:object({separator:values('|','.','->',' '),unique_names:bool,limit:integer,min_values:integer,min_values_by_dimension:array(object({field:str,value:integer})),variable_bindings:object({limit:object({name:str,id:integer,type:{const:4},value:integer,selected_proxy_equal:{const:true}}),unique_names:object({name:str,id:integer,type:{const:1},value:bool,selected_proxy_equal:{const:true}}),separator:object({name:str,id:integer,type:{const:5},value:str,selected_proxy_equal:{const:true}})},[]),include_null:bool,include_other:bool},['separator','unique_names','limit','min_values','include_null','include_other']),
 output_mapping:object({verified:{const:true},inventory_complete:{const:true},source_identity_verified:{const:true},autosync:bool,
  node_context:object({...ref.properties,verified:{const:true},output_port:object({port:{const:0}})}),
  source_fields:array(object({record_id:str,name:str,label:str,type:str,required:bool})),
  target_fields:array(object({index:integer,name:str,label:str,type:str,excluded:bool,source:object({record_id:str,name:str,label:str,type:str})}))}),
 output_scope:values('not_materialized','observed_after_verified_execution'),execution_id:nullable(str),category_fields:array(crossTableCategoryField),
 package_persistence_verified:{const:false}},['kind','scope','values_are','node','receipt_ids','mode','category_mode','row_keys','column','columns','facts','options','output_scope','execution_id','category_fields','package_persistence_verified']);
const javascriptReadbackProperties={kind:values('javascript'),scope:values('observed_after_verified_finish'),node:ref,
 values_are:values('independent_owned_source_readback'),schema_mode:values('code'),
 source:object({sha256:{type:'string',pattern:'^[a-f0-9]{64}$'},utf8_bytes:{type:'integer',minimum:0,maximum:32768},lf_lines:{type:'integer',minimum:1,maximum:1024}}),
 settings_preserved:{type:'boolean',const:true},wizard_commit_verified:{type:'boolean',const:true},
 package_persistence_verified:{type:'boolean',const:false}};
const javascriptConfigurationReadback=object({...javascriptReadbackProperties,receipt_ids:{...array(str),minItems:6,maxItems:9},
 execution_effects:object({explicit_execute_requested:{type:'boolean',const:false},internal_execution_started:{type:'null'}})});
const javascriptExecutedConfigurationReadback=object({...javascriptReadbackProperties,receipt_ids:{...array(str),minItems:12,maxItems:13},
 execution_effects:object({explicit_execute_requested:{type:'boolean',const:true},internal_execution_started:{type:'null'}}),
 input_mapping:object({port:{type:'integer',const:0},autosync:bool,fields:boundedFields(readbackMappingField)}),
 output_mapping:object({port:{type:'integer',const:0},autosync:bool,fields:boundedFields(object({...readbackMappingField.properties,excluded:bool}))})});
const javascriptDeclaredConfigurationReadback=object({...javascriptExecutedConfigurationReadback.properties,
 schema_mode:values('declared'),columns:{...array(object({index:integer,name:str,label:str,
 type:values('integer','real','string','boolean','datetime'),data_kind:values('Неопределенное','Непрерывный','Дискретный'),
 usage:values('Не задано','Активное','Выходное','Группа','Показатель','Транзакция','Элемент'),
 usage_type:integer,default_usage_type:integer,required:bool})),minItems:1,maxItems:64}});
const javascriptDeclaredDoneReadback=object({...javascriptConfigurationReadback.properties,
 schema_mode:values('declared'),columns:javascriptDeclaredConfigurationReadback.properties.columns});
const restConfigurationReadback=object({kind:values('rest_request'),scope:values('observed_before_verified_finish'),node:ref,values_are:values('observed_ui_values'),method:values('GET'),
 connection:nullable(object({name:str,base_url:str,method:values('GET'),url_mode:values('query'),authentication:values('none'),verify_server_certificate:{const:true},query_parameters:array(str),reference_node_id:str,response_content_type:values('application/json','text/html')},['name','base_url','method','url_mode','authentication','verify_server_certificate','query_parameters','reference_node_id'])),
 query_parameters:array(object({name:str,field:str})),receipt_ids:{...array(str),minItems:2,maxItems:2},package_persistence_verified:{const:false}});
const clusteringConfigurationReadback=object({kind:values('clustering'),scope:values('observed_before_verified_finish'),values_are:values('observed_ui_values'),node:ref,
 receipt_ids:{...array(str),minItems:5,maxItems:5},mode:values('k_means'),features:{...array(str),minItems:1,maxItems:128},clusters:{type:'integer',minimum:2,maximum:1000},seed:{type:'integer',minimum:0,maximum:2147483647},normalization:values('none'),
 training:{anyOf:[restConfigurationReadback,object({status:values('not_requested')}),object({status:values('trained'),node:ref,execution_id:str,source:{...array(object({node:ref,output:integer,input:{type:'integer',const:0}})),minItems:1,maxItems:1}})]},package_persistence_verified:{type:'boolean',const:false}});
const logRegressionConfigurationReadback=object({kind:values('log_regression'),scope:values('observed_before_verified_finish'),values_are:values('observed_ui_values'),node:ref,
 receipt_ids:clusteringConfigurationReadback.properties.receipt_ids,mode:values('enter','forward','backward','stepwise'),input_fields:{type:'array',items:str,minItems:1,maxItems:128},target_field:str,
 classes:{type:'array',items:object({index:integer,label:str}),minItems:2,maxItems:2},event:str,threshold:{type:'number',minimum:0,maximum:1},intercept:{const:true},epsilon:{const:1e-10},
 normalization:values('none'),train_percent:{const:100},validation:values('none'),calibration:values('train'),training:clusteringConfigurationReadback.properties.training,package_persistence_verified:{const:false}},['kind','scope','values_are','node','receipt_ids','mode','input_fields','target_field','classes','event','threshold','intercept','epsilon','normalization','train_percent','validation','calibration','training','package_persistence_verified']);
const linRegressionConfigurationReadback=object({kind:values('lin_regression'),scope:values('observed_before_verified_finish'),values_are:values('observed_ui_values'),node:ref,
 receipt_ids:clusteringConfigurationReadback.properties.receipt_ids,mode:values('enter','apply'),input_fields:{...array(str),minItems:1,maxItems:128},target_field:str,intercept:{type:'boolean',const:true},normalization:values('none'),
 training:clusteringConfigurationReadback.properties.training,package_persistence_verified:{type:'boolean',const:false}});
const excelConfigurationReadback=object({kind:values('excel_import'),scope:values('observed_before_verified_finish'),node:ref,values_are:values('observed_ui_values'),source:object({source_path:str,sheet_method:str,sheet:str,header_rows:integer,whole_sheet:bool,blank_rows:str}),auto_detect:values('Нет'),columns:array(object({name:str,label:str,type:str,data_kind:str,used:bool})),receipt_ids:array(str),package_persistence_verified:{const:false}});
const elimOutlierConfigurationReadback=object({kind:values('elim_outlier'),scope:values('observed_before_verified_finish'),values_are:values('observed_ui_values'),node:ref,receipt_ids:{...array(str),minItems:5,maxItems:5},mode:values('detect'),fields:{...array(object({name:str,method:values('sd','iqr'),outlier_factor:{type:'number',minimum:0},extreme_factor:{type:'number',minimum:0},outlier_policy:values('keep'),extreme_policy:values('keep')})),minItems:1,maxItems:128},ordered:bool,training_basis:values('current_input'),training:clusteringConfigurationReadback.properties.training,output_mappings:array(object({port:integer,fields:array(object({index:integer,name:str,label:str,type:str,data_kind:str,source_name:str}))})),package_persistence_verified:{const:false}});
const autoCorrelationConfigurationReadback=object({kind:values('auto_correlation'),scope:values('observed_before_verified_finish'),values_are:values('observed_ui_values'),node:ref,receipt_ids:{type:'array',items:str,minItems:5,maxItems:5},mode:values('time_domain'),field:str,lag_count:{type:'integer',minimum:1,maximum:9007199254740991},domain:values('time'),pacf:{const:false},output_port:{const:0},fields:array(object({name:str,label:str,type:str})),package_persistence_verified:{const:false}});
const corrAnalysisConfigurationReadback=object({kind:values('corr_analysis'),scope:values('observed_before_verified_finish'),values_are:values('observed_ui_values'),node:ref,receipt_ids:{...array(str),minItems:5,maxItems:5},mode:values('pearson'),first_set:{...array(str),minItems:1,maxItems:128},second_set:{...array(str),minItems:1,maxItems:128},coefficients:array(values('pearson')),package_persistence_verified:{const:false}});
const samplingConfigurationReadback=object({kind:values('sampling','data_partition'),scope:values('observed_before_verified_finish'),values_are:values('observed_ui_values'),node:ref,receipt_ids:{...array(str),minItems:5,maxItems:5},mode:values('sequential'),counts:array(integer),groups:array(str),output_mappings:array(object({port:integer,fields:boundedFields(readbackMappingField)})),package_persistence_verified:disabled});
const binningInterval=object({number:integer,lower:{type:'number'},upper:{type:'number'},label:str,lower_included:bool,upper_included:bool});
const binningModel=object({state:values('settings','materialized'),intervals:array(binningInterval)});
const binningConfigurationReadback=object({kind:values('binning'),scope:values('observed_before_verified_finish'),values_are:values('observed_ui_values'),node:ref,receipt_ids:{...array(str),minItems:5,maxItems:5},mode:values('internal','apply'),field:str,type:values('integer','real'),method:values('count','width','frequency'),size:{type:'number',exclusiveMinimum:0},limits:nullable({...array({type:'number'}),minItems:2,maxItems:2}),rounding:{const:false},open_ends:{const:false},ties:nullable(values('next')),state:binningModel.properties.state,intervals:binningModel.properties.intervals,
 training:{anyOf:[object({status:values('not_requested')}),object({status:values('trained'),node:ref,execution_id:str,source:{...array(object({node:ref,output:integer,input:{const:0}})),minItems:1,maxItems:1},model:binningModel})]},output_mappings:array(object({port:integer,fields:array(readbackMappingField)})),package_persistence_verified:{const:false}});
const samplingModesConfigurationReadback=object({kind:values('sampling','data_partition'),scope:values('observed_before_verified_finish'),values_are:values('observed_ui_values'),node:ref,receipt_ids:{...array(str),minItems:5,maxItems:5},mode:values('random'),seed:integer,test_priority:disabled,counts:array(integer),groups:array(str),output_mappings:array(object({port:integer,fields:boundedFields(readbackMappingField)})),package_persistence_verified:disabled});
const jsonTreeConfigurationReadback=object({kind:values('json_to_tree'),mode:values('auto_structure'),scope:values('observed_before_verified_finish'),values_are:values('observed_ui_values'),
 node:ref,receipt_ids:array(str),package_persistence_verified:{const:false},json_field:str,root_mode:values('auto'),auto_structure:{const:true},strict:{const:true},exclude_root:{const:false}});
const treeTableConfigurationReadback=object({kind:values('tree_to_table'),mode:values('selected_nodes'),scope:values('observed_before_verified_finish'),values_are:values('observed_ui_values'),
 node:ref,receipt_ids:array(str),package_persistence_verified:{const:false},selected_paths:{...array(str),minItems:1,maxItems:64},repeat_parents:bool,
 composite_names:{const:false},composite_labels:{const:false},label_separator:values('.')});
const configurationReadback={anyOf:[convertedReplacementConfigurationReadback,smoothingConfigurationReadback,binningConfigurationReadback,samplingModesConfigurationReadback,autoCorrelationConfigurationReadback,excelExportConfigurationReadback,jsonTreeConfigurationReadback,treeTableConfigurationReadback,elimOutlierConfigurationReadback,regexReplacementConfigurationReadback,corrAnalysisConfigurationReadback,logRegressionConfigurationReadback,samplingConfigurationReadback,restConfigurationReadback,excelConfigurationReadback,linRegressionConfigurationReadback,clusteringConfigurationReadback,crossTableConfigurationReadback,exportConfigurationReadback,collapseConfigurationReadback,missingValuesConfigurationReadback,slidingWindowConfigurationReadback,dateTimeConfigurationReadback,replacementConfigurationReadback,importConfigurationReadback,calculatorConfigurationReadback,javascriptConfigurationReadback,javascriptDeclaredDoneReadback,javascriptExecutedConfigurationReadback,javascriptDeclaredConfigurationReadback,groupingConfigurationReadback,sortingConfigurationReadback,reformConfigurationReadback,filterConfigurationReadback,joinConfigurationReadback,unionConfigurationReadback,duplicatesConfigurationReadback]};
export const nodeApplyResultSchema=object({operation_id:str,status:values('SUCCEEDED','FAILED','NOT_APPLIED','AMBIGUOUS'),
 effect_possible:bool,phases:array(receipt),node:nullable(ref),execution,output,
 package_saved:{type:'boolean',const:false},cleanup_complete:bool,warnings:array(str),
 configuration:object({status:values('applied','discarded','not_requested','unknown'),readback:configurationReadback},['status']),
 checkpoint_kind:values('local_node_checkpoint','local_node_cancellation','local_node_stopped','local_node_failed','local_node_released'),
 persisted_package_verified:{type:'boolean',const:false},pending_phase:nullable(phase),released_phase:phase,error,
 next_step:object({tool:values('dock_node_apply','dock_node_read','dock_action_run'),original_operation_id:str,instruction:str})},
 ['operation_id','status','effect_possible','phases','node','execution','output','package_saved','cleanup_complete','warnings']);
const outcome=object({status:values('SUCCEEDED','FAILED','NOT_APPLIED','AMBIGUOUS'),action_key:{type:'string',const:'node.apply'},
 action_revision:str,operation_id:str,phase:str,effect_possible:bool,cleanup_complete:bool,
 output:nodeApplyResultSchema,error:nullable(error),trace:array({type:'object'})});
const progress=object({node:nullable(ref),execution,accepted_phases:array(phase),pending_phase:nullable(phase),effect_possible:bool,cleanup_complete:bool});
export const nodeJobResultSchema=object({operation_id:str,attempt:{type:'integer',minimum:1},state:values('running','settled'),
 cancel_requested:bool,server_stop_requested:bool,progress:nullable(progress),outcome:nullable(outcome),error:nullable(error)});
export const deliveryJobResultSchema=object({operation_id:str,state:values('running','settled'),phase:str,upload_operation_id:str,
 status:values('authorizing','staging','uploading','verifying_size','ready','cancelling','cancelled','failed','uncertain'),bytes:integer,total_bytes:integer,percent:{type:'number',minimum:0,maximum:100},elapsed_ms:integer,deadline_at:integer,poll_after_ms:integer,
 outcome:nullable(object({status:values('SUCCEEDED','FAILED','NOT_APPLIED','AMBIGUOUS'),upload_operation_id:str,
  destination:str,bytes:integer,sha256:str,verification_id:str,cleanup_complete:bool,upload_completion_verified:bool,
  code:str,effect_possible:bool},['status'],true)),error:nullable(object({code:str,message:str},['message'],true))},['operation_id','state','phase','upload_operation_id','outcome','error']);
