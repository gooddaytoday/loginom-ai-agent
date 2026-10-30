import {excelSettingsSchema} from './imports-excel-parameters.mjs';
import {importSourceSchema} from './storage-policy.mjs';
import {restRequestParametersSchema} from './rest-request-parameters.mjs';
import {DATE_TIME_OPERATIONS} from './date-time-parameters.mjs';
import {JAVASCRIPT_DECLARED_TYPES,JAVASCRIPT_DECLARED_COLUMN_LIMIT} from './javascript-column-types.mjs';
import {NODE_POSITION_MIN} from './node-contracts.mjs';
import {validateActionParameters} from './action-catalog.mjs';
import {nodeJobResultSchema,deliveryJobResultSchema} from './node-result-schema.mjs';
import {validateJavascriptSourceReadRequest} from './javascript-source-read-session.mjs';
import {javascriptSourceInitialSchema,javascriptSourceContinuationSchema,javascriptSourceReceiptSchema} from './javascript-source-read-schema.mjs';
import {javascriptContextInitialSchema,javascriptContextReceiptSchema,validateJavascriptContextReadRequest} from './javascript-context-read.mjs';

const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const text=(maxLength=128)=>({type:'string',minLength:1,maxLength});
const fieldName={...text(128),pattern:'^[A-Za-z_][A-Za-z0-9_]{0,127}$',description:'ASCII name; title=label.'};
const id={...text(),pattern:'^[A-Za-z0-9_.:-]+$'};
const integer=(minimum,maximum)=>({type:'integer',minimum,maximum});
const choice=(...values)=>({type:'string',enum:values});
const boolean={type:'boolean'};
const array=(items,maxItems,minItems=0)=>({type:'array',items,maxItems,minItems});
const ref=object({document_id:id,workflow_id:id,node_id:id});
const sourceSettings=object({source_path:text(2048),encoding:text(80),rows_to_skip:integer(0,1000000),first_line_as_title:boolean},[]);
const format=object({delimiter:{type:'string',minLength:1,maxLength:1},decimal_separator:choice('.',','),
 null_marker:{type:'string',maxLength:256},text_qualifier:{type:'string',maxLength:1},multiple_delimiters:boolean,date_format:choice('dd/mm/yyyy','mm/dd/yyyy','yyyy/mm/dd','dd/mm/yy','mm/dd/yy','yy/mm/dd'),date_separator:choice('.','/','\\','-')},[]);
const column=object({source_name:{...text(120),description:'Observed source name or unique CSV header/label; never guess transliteration. name=result identifier, label=title.'},name:{...fieldName,maxLength:120},label:text(120),
 type:choice('integer','real','string','boolean','datetime'),data_kind:choice('Неопределенное','Непрерывный','Дискретный'),used:boolean},[]);
export const duplicatesParametersSchema=object({input_fields:array(text(128),1000,1),output_fields:array(text(128),1000)});
export const calculatorExpressionSchema={...object({target:{...object({kind:choice('new','existing'),name:fieldName},['kind']),
 description:'New: {kind:new}, sibling name. Saved: {kind:existing,name:saved_name}.',
 allOf:[{if:{properties:{kind:{const:'new'}},required:['kind']},then:{not:{required:['name']}},else:{required:['name']}}]},
 name:fieldName,label:text(200),type:choice('integer','real','string','boolean','datetime'),formula:{...text(2048),description:'Loginom: bare field names (A-B), no [A]. Int(number)=integer part, Val(text)=locale parse. SubStr(text,start,length): all 3 args; no MID. Other signatures: Help processors/func/calc-func/{string,mathematical}.md. Choose the formula.'},replace:{...boolean,description:'Replace same-name INPUT. Edit expression: target.kind=existing. Added field (also default Expr1): false.'}},['target']),
 allOf:[{if:{properties:{target:{properties:{kind:{const:'new'}},required:['kind']}},required:['target']},then:{required:['name','label','type','formula','replace']}}]};
export const calculatorParametersSchema={...object({expressions:array(calculatorExpressionSchema,128),order:{...array(text(128),128,1),description:'Optional complete order of calculated expression names only. Do not include inherited input columns. Omit to keep expression declaration order.'}},['expressions']),
 description:'This schema describes parameters only. Every dock_node_apply request also REQUIRES top-level finish, beside parameters, not inside it. To create, execute and read the Calculator include "finish":"execute"; request fragment: {"parameters":{"expressions":[...]},"finish":"execute"}. For a new calculator, inputs must contain one table connection to input 0. target.kind=new ADDS an expression and must not repeat a saved expression name. For an existing calculator, parameters:{expressions:[]} preserves every formula (use finish=execute to read output); edits address target:{kind:existing,name:saved_name} inside each expression. Analytical formulas remain your choice.'};
export const crossTableFieldSchema={...object({kind:{...choice('input_field'),description:'Input field.'},name:{...fieldName,description:'Observed name.'}}),description:'Verified upstream.'};
export const crossTableParametersSchema={...object({
 row_keys:{...array(crossTableFieldSchema,128),description:'Discrete row keys in order; []=overall summary.'},
 column:{...crossTableFieldSchema,description:'One discrete dimension; use column OR columns.'},
 columns:{...array(crossTableFieldSchema,128),description:'Discrete dimensions in order; []=one summary group; omit column.'},
 facts:{...array(object({field:{...crossTableFieldSchema,description:'Typed input fact; exact Variant needs coverage=full, verified static prepared source.'},functions:{...array(choice('sum','count','min','max','avg','stddev','sum_squares','unique_count','null_count','first','last'),11,1),description:'Complete set. count/first/last include NULL; first/last follow input order. unique_count, scalar min/max skip NULL; Variant min ranks NULL lowest. Numeric: all; string/Boolean/Variant: count,min,max,unique_count,null_count,first,last; datetime adds avg,stddev(days). stddev: n-1; singleton=0.'}}),128,1),description:'Ordered facts/functions; incompatible types refuse before creation.'},
 category_mode:{...choice('fixed','sliding'),description:'fixed=initial categories; sliding=regenerate each execution.'},
 include_null:{...boolean,description:'fixed only, required: separate NULL category.'},
 include_other:{...boolean,description:'fixed only, required: new categories enter Other.'},
 min_values:{...integer(0,1000),description:'Minimum slots/dimension, including empty; independent of limit.'},limit:{...integer(0,1000),description:'Category cap; 0=unlimited; can truncate reserved slots.'},
 separator:{...choice('|','.','->',' '),description:'Category/fact/function label separator; whitespace matters.'},
 unique_names:{...boolean,description:'Native category names: transliteration/collision suffixes. Read, never guess.'},
 local_variables:{...array(object({name:fieldName,type:choice('integer','boolean','string'),value:{anyOf:[integer(0,1000),boolean,text(120)]}}),3),description:'Create/update local control defaults; retain existing IDs/types and other local values. No nonlocal variables.'},
 bindings:{...object({limit:object({variable:fieldName}),unique_names:object({variable:fieldName}),separator:object({variable:fieldName})},[]),description:'Exact local variable names; declare new bindings in local_variables; omit bound static settings. Existing variable/binding-only patches preserve roles and update actual values.'}
},[]),description:'New CrossTable requires row_keys, column or columns, facts and category_mode. fixed also requires explicit include_null/include_other. Existing parameters={} preserves supported settings; refresh output with dock_node_read instead. Explicit category lists are unsupported. Output mappings require execute and exact configured_field names: rename, label, order and autosync are supported; own output fields are mandatory. Exclusion requires a separate downstream Field Parameters node.'};
// Prepared schema for the JavaScript handler. It is not exposed in the node
// catalog until the owned editor/execute/read driver is registered.
export const javascriptParametersSchema=object({source_text:{type:'string',maxLength:32768,
 description:'LF source: new required; existing omit=keep, empty=replace. <=32768 UTF-8 bytes/1024 lines; no CR/NUL (local check).'},
 expected_source_sha256:{...text(64),minLength:64,pattern:'^[a-f0-9]{64}$',description:'Replacing saved source: complete owned read digest.'},
 schema_mode:choice('declared','code'),
 columns:{...array({oneOf:Object.entries(JAVASCRIPT_DECLARED_TYPES).map(([type,definition])=>object({
  name:fieldName,label:text(120),type:{type:'string',const:type},data_kind:choice(definition.kind),
  usage:choice('Не задано','Активное','Выходное','Группа','Показатель','Транзакция','Элемент')}))},JAVASCRIPT_DECLARED_COLUMN_LIMIT,1),
  description:'Ordered declared columns; all 5 fields. Only default type/kind pairs (see alternatives); usage Не задано=default role.'}},[]);
export const groupingFieldSchema=object({kind:choice('input_field'),name:fieldName});
export const groupingMeasureSchema=object({field:groupingFieldSchema,function:choice('sum','count','avg','min','max'),name:fieldName,label:text(120)});
export const groupingParametersSchema=object({group_by:array(groupingFieldSchema,128,1),measures:array(groupingMeasureSchema,256,1)},[]);
export const replacementValueSchema=object({type:choice('string','integer','real'),value:{type:['string','number','null'],maxLength:2048}});
export const replacementRuleSchema=object({field:groupingFieldSchema,type:choice('string','integer','real'),pairs:array(object({from:replacementValueSchema,to:replacementValueSchema}),256),other:object({mode:choice('keep','null','value'),value:replacementValueSchema},['mode']),case_sensitive:boolean,precision:{const:0}},['field','type','pairs','other']);
export const replacementParametersSchema=object({rules:array(replacementRuleSchema,128,1),output_mode:choice('replace','add')},[]);
export const dateTimeParametersSchema=object({fields:array(object({field:groupingFieldSchema,transformations:array(object({operation:choice(...Object.keys(DATE_TIME_OPERATIONS)),name:text(128),label:text(120)}),12)}),128)},[]);
export const missingValuesFieldSchema=object({field:groupingFieldSchema,method:choice('mean','constant'),value:{type:'string',maxLength:2048}},['field','method']);
export const missingValuesParametersSchema=object({fields:array(missingValuesFieldSchema,128,1),max_nulls_percent:{type:'integer',minimum:0,maximum:100},ordered:{const:false}},[]);
export const collapseParametersSchema=object({information:array(groupingFieldSchema,128),transposed:array(groupingFieldSchema,128,1),ignore_empty:boolean},[]);
export const logRegressionParametersSchema=object({logistic:{"type":"object","properties":{"input_fields":{"type":"array","items":{"type":"string","minLength":1,"maxLength":128},"minItems":1,"maxItems":128,"description":"Complete continuous numeric predictor names; other fields pass through."},"target_field":{"type":"string","minLength":1,"maxLength":128,"description":"One discrete string target with exactly two non-null classes."},"event":{"type":"string","minLength":1,"maxLength":128,"description":"Exact event category label, resolved from the observed class list, never an index."},"threshold":{"type":"number","minimum":0,"maximum":1,"description":"Explicit cutoff: event if probability >= threshold."}},"required":["input_fields","target_field","event","threshold"],"additionalProperties":false}});
export const linRegressionParametersSchema=object({input_fields:{...array(text(128),128,1),description:'Complete list of continuous numeric predictor field names. Identifier and other unlisted fields are retained and ignored.'},target_field:{...text(128),description:'One continuous numeric response name; distinct from all predictors.'}},['input_fields','target_field']);
export const clusteringParametersSchema=object({features:{...array(groupingFieldSchema,128,1),description:'All continuous numeric features; retain/ignore unlisted fields/IDs.'},clusters:{...integer(2,1000),description:'Fixed cluster count; no auto.'},seed:{...integer(0,2147483647),description:'New default=42; existing omitted=preserve.'},normalization:{...choice('none'),description:'Default none; only mode.'}},[]);
export const sortingKeySchema=object({field:groupingFieldSchema,direction:choice('ASC','DESC'),case_sensitive:{...boolean,description:'Per key: required for string/variant; omit for numeric/date/boolean.'}},['field','direction']);
export const sortingParametersSchema=object({keys:array(sortingKeySchema,128,1),compare_with_locale:boolean},[]);
export const filterConditionSchema=object({field:object({kind:choice('input_field','row_number'),name:text(128)},['kind']),
 operator:choice('<','<=','>','>=','=','<>','is_null','not_null','between','not_between','in','not_in','contains','not_contains','starts_with','not_starts_with','ends_with','not_ends_with','is_true','is_false'),
 type:choice('integer','real','string','datetime','boolean'),value:{type:['string','number','boolean']},lower:{type:['string','number']},upper:{type:['string','number']},values:array({type:['string','number']},128,1),case_sensitive:boolean},['field','operator','type']);
filterConditionSchema.description='datetime literals: local ISO date+time with seconds (2024-01-01T00:00:00), optional .sss; no date-only/timezone. Inner group=AND; groups=OR.';
export const unionParametersSchema=object({prefixes:object({enabled:boolean,name:{type:'string',maxLength:128},label:{type:'string',maxLength:128}}),tables:array(object({port:integer(1,14),fields:array(object({source:text(128),main:{type:['string','null'],minLength:1,maxLength:128}}),1000)}),14,1)});
export const joinKeySchema=object({left:text(128),right:text(128)});
export const joinParametersSchema=object({keys:array(joinKeySchema,1000,1),case_sensitive:boolean,include_joined_keys:boolean},[]);
export const filterParametersSchema=object({groups:array(array(filterConditionSchema,128,1),64,1)},[]);
export const reformChangeSchema=object({field:groupingFieldSchema,name:text(128),label:text(128),type:choice('string','integer','real','boolean','datetime'),data_kind:choice('Неопределенное','Непрерывный','Дискретный'),usage:choice('Не задано','Активное','Выходное','Группа','Показатель','Транзакция','Элемент'),excluded:boolean},['field']);
export const reformParametersSchema=object({changes:array(reformChangeSchema,128)},['changes']);
reformParametersSchema.description='For a new Reform, exclude input fields using parameters.changes with field.kind=input_field and excluded=true. Omit excluded fields from output mappings; use output mappings for remaining field order and renaming.';
// New nodes require complete settings; existing nodes accept a patch. The installed
// handler validates that distinction and cross-field invariants before any UI work.
export const textExportParametersSchema=object({destination:text(512),overwrite:choice('reject','replace'),encoding:choice('UTF-8'),delimiter:choice(';',',','\t'),header:choice('none','names','labels'),bom:boolean,line_ending:choice('LF','CRLF'),text_qualifier:choice('"'),decimal_separator:choice('.',','),date_separator:choice('.','/','\\','-'),time_separator:choice(':','.'),null_marker:choice('','?','null','NULL'),true_value:choice('True','Истина','Да'),false_value:choice('False','Ложь','Нет'),date_format:choice('dd/mm/yyyy','mm/dd/yyyy','yyyy/mm/dd','dd/mm/yy','mm/dd/yy','yy/mm/dd'),time_format:{...choice('h:mm','hh:mm','h:mm:ss','hh:mm:ss','hh:nn:ss.zzz'),description:'Use hh:nn:ss.zzz for ms; warn: native -0 to 0, midnight can lose ms.'}},[]);
export const nodeApplyInputSchema=object({
 operation_id:id,contract_revision:choice('1.0.0'),document_id:id,
 workflow_ref:object({workflow_id:id,tab_tid:text(128),prefix:text(128),navigation_path:array(object({tid:text(512),label:{type:'string'}}),32,1)}),
 target:object({kind:choice('new','existing'),type:choice('datamining.log_regression','imports.excel','integration.rest_request','datamining.lin_regression','datamining.clustering','transform.cross_table','exports.text','transform.collapse_columns','preprocessing.data_recovery','transform.date_time','research.duplicates','imports.text','transform.calculator','transform.group_data','transform.sorting','transform.replace_columns','transform.reform_columns','transform.filter_data','transform.join_data','transform.union_data','programming.javascript'),label:{...text(200),pattern:'^(?!\\s*$)[^;|<>"\'\\\\\\u0000-\\u001f]+$',description:'Optional nonblank node caption, 1–200 UTF-16 units. No ; | < >, single/double quotes, backslash or U+0000..U+001F. Omit if unneeded; conditions and formulas in parameters, not target.label.'},ref,
  position:{...object({x:{type:'number',minimum:NODE_POSITION_MIN,maximum:10000},y:{type:'number',minimum:NODE_POSITION_MIN,maximum:10000}}),description:'Model coordinates; safe label/port margin. Omit=auto; explicit unchanged.'}},['kind','type']),
 inputs:array(object({source:ref,output:integer(0,99),input:integer(0,99)}),15),
 mode:choice('apply','xlsx','request','enter','k_means','pivot','unpivot','impute','calendar','mark','delimited','expression','aggregate','keys','scalar','conditions','inner','left','append_all','exact','script'),parameters:object({logistic:logRegressionParametersSchema.properties.logistic,excel:excelSettingsSchema,...restRequestParametersSchema.properties,target_field:linRegressionParametersSchema.properties.target_field,...clusteringParametersSchema.properties,...crossTableParametersSchema.properties,...textExportParametersSchema.properties,information:collapseParametersSchema.properties.information,transposed:collapseParametersSchema.properties.transposed,ignore_empty:boolean,input_fields:duplicatesParametersSchema.properties.input_fields,output_fields:duplicatesParametersSchema.properties.output_fields,
  source:importSourceSchema,
  preview_only:{const:true},
  source_switch:object({profile_id:id,save_operation_id:id}),
  settings:object({source:sourceSettings,format,columns:array(column,1000,1)},[]),
  fields:{anyOf:[dateTimeParametersSchema.properties.fields,missingValuesParametersSchema.properties.fields]},max_nulls_percent:missingValuesParametersSchema.properties.max_nulls_percent,ordered:missingValuesParametersSchema.properties.ordered,rules:replacementParametersSchema.properties.rules,output_mode:replacementParametersSchema.properties.output_mode,prefixes:unionParametersSchema.properties.prefixes,tables:unionParametersSchema.properties.tables,expressions:array(calculatorExpressionSchema,128),order:array(text(128),128,1),group_by:array(groupingFieldSchema,128,1),measures:array(groupingMeasureSchema,256,1),keys:array({anyOf:[sortingKeySchema,joinKeySchema]},1000,1),case_sensitive:boolean,include_joined_keys:boolean,compare_with_locale:boolean,changes:array(reformChangeSchema,128),groups:filterParametersSchema.properties.groups,
  ...javascriptParametersSchema.properties,
  columns:{anyOf:[crossTableParametersSchema.properties.columns,javascriptParametersSchema.properties.columns]}},[]),
 mappings:array(object({direction:choice('input','output'),port:integer(0,14),autosync:boolean,
  changes:{...array(object({source:object({kind:choice('configured_field'),name:text(128)}),name:text(128),label:text(120),excluded:boolean},['source']),1000),description:'Output patch. Mutually exclusive with fields per mapping.'},
  fields:{...array(object({source:object({kind:choice('configured_field'),name:text(128)}),name:text(128),label:text(120),excluded:boolean},['source']),1000,1),description:'Complete ordered layout: EVERY source, including excluded:true. Mutually exclusive with changes per mapping; ordering+exclusions use fields.'}},['direction','port']),16),
 finish:{...choice('done','execute','close'),description:'Required top-level field beside parameters; no default. "finish":"execute"=commit/run/fresh read; done=commit; close=discard. done/close: read.ports=[]. Omit read=defaults.'},
 read:object({ports:{...array(integer(0,1),2),description:'execute only; done/close/text export=[]. Omit read=defaults.'},sample_rows:integer(0,100),require_exact_numbers:boolean,coverage:{...choice('full','sample'),description:'sample default=10, max100 rows/10000 cells/512 KiB UTF-8 JSON values. full: executed Collapse/CrossTable port0 (native, <=50 rows/8 columns), or installed JavaScript port0 with sample_rows=100, require_exact_numbers=true; refuses unproven complete bounded preview, no native-byte provenance.'}},['ports','sample_rows','require_exact_numbers']),
 budgets:{...object({
  configure_ms:{...integer(1,1800000),description:'All setup: source/workflow/mappings/finish; wide imports may exceed 120s.'},
  execute_ms:{...integer(1,1800000),description:'Identified execution wait.'},
  total_ms:{...integer(1,1800000),description:'Total setup/execution/reads/cleanup; never reset on poll/retry.'}
 }),description:'Prefer defaults; override for task deadline only. total_ms covers all phases.'},
});
// Discovery uses the same public parameter shapes. Requirements depending on
// target.kind remain in the installed handler, before any browser mutation.
export const textImportParametersSchema=object({
 preview_only:{const:true,description:'source.kind=storage; settings.source={source_path}; finish=close; inputs=mappings=read.ports=[]. Read encoding/format/columns and <=25 rendered rows; discard without Execute. server_profile: coverage=preview, no SHA/full N. Reuse node after download/profile/scan/sample.'},
 source_switch:{...structuredClone(nodeApplyInputSchema.properties.parameters.properties.source_switch),description:'Only for an existing text or Excel import: after an exact full scan and package.save_checkpoint, switch settings.source.source_path (text) or excel.source_path and optional sheet_name (Excel) alone, preserve/reopen-check all columns and output mapping, execute once and verify full output-0 row count. Only profile_id is supplied: backend binds an exact scan receipt to the delivered source digest. Missing receipt yields N not verified with a reason, never successful count verification. Never supply expected_records. No column, format or mapping changes allowed. Timeout: inspect the SAME operation, never execute again.'},
 source:{...structuredClone(nodeApplyInputSchema.properties.parameters.properties.source),
  description:'Required for new imports and configuration changes: kind:storage with server_source_ref from a native Files observation selects an existing server file WITHOUT upload; or kind:verified_delivery with artifact_id and upload_operation_id from completed verified delivery (legacy delivery IDs remain accepted). Optional bytes and sha256 must match that receipt. Omit source only to execute an unchanged existing Import: settings:{}, inputs:[], mappings:[], finish:execute and read.ports:[0]. This uses the saved native configuration without uploading again; an old upload ID is not a current receipt.'},
 settings:{...structuredClone(nodeApplyInputSchema.properties.parameters.properties.settings),
  description:'Optional settings.format.multiple_delimiters is boolean; date_format is an explicit dd/mm/yyyy, mm/dd/yyyy, yyyy/mm/dd, dd/mm/yy, mm/dd/yy or yy/mm/dd order and date_separator is ., /, backslash or -. Omission preserves native settings, including on partial existing-node patches; no automatic encoding or date substitution. For target.kind=new supply all three objects: source, format, columns. source requires source_path (the verified delivery destination), encoding, rows_to_skip, first_line_as_title. format requires delimiter, decimal_separator, null_marker, text_qualifier. columns must describe every CSV field with name, label, type, data_kind, used; source_name optionally identifies an original field when renaming. At least one field must be used. For target.kind=existing settings is a patch: omitted settings are preserved, and settings:{} reuses the saved configuration. A column patch identifies its field by source_name or name.'},
},['settings']);
// Cross-field restrictions survive the compact user envelope. Runtime guards
// remain authoritative after optional defaults are expanded.
nodeApplyInputSchema.allOf=[
 {if:{properties:{target:{properties:{type:{const:'programming.javascript'}},required:['type']}},required:['target']},
  then:{properties:{mode:{const:'script'},parameters:javascriptParametersSchema}},
  else:{properties:{mode:{not:{const:'script'}},parameters:{not:{anyOf:Object.keys(javascriptParametersSchema.properties).filter(key=>key!=='columns').map(key=>({required:[key]}))}}}}},
 {if:{properties:{target:{properties:{type:{const:'transform.cross_table'}},required:['type']}},required:['target']},
  then:{properties:{parameters:{properties:{columns:crossTableParametersSchema.properties.columns}}}},
  else:{if:{properties:{target:{properties:{type:{const:'programming.javascript'}},required:['type']}},required:['target']},
   else:{properties:{parameters:{not:{required:['columns']}}}}}},
 {if:{properties:{finish:{enum:['done','close']}},required:['finish']},
  then:{properties:{read:{properties:{ports:{maxItems:0}}}}}},
 {if:{properties:{target:{properties:{type:{const:'exports.text'}},required:['type']}},required:['target']},
  then:{properties:{read:{properties:{ports:{maxItems:0}}}}}},
 {if:{properties:{read:{properties:{coverage:{const:'full'}},required:['coverage']}},required:['read']},
  then:{properties:{finish:{const:'execute'},target:{properties:{type:{enum:['transform.collapse_columns','transform.cross_table','programming.javascript']}}},read:{properties:{ports:{const:[0]}}}}}},
 {if:{properties:{target:{properties:{type:{const:'programming.javascript'}},required:['type']},read:{properties:{coverage:{const:'full'}},required:['coverage']}},required:['target','read']},
  then:{properties:{read:{properties:{sample_rows:{const:100},require_exact_numbers:{const:true}}}}}}
];
const operation=object({operation_id:id});
const deliveryId={...id,maxLength:80};
const delivery=object({operation_id:deliveryId,artifact_id:id,upload_grant_id:id,budget_ms:integer(1000,1800000)});
const resumeDelivery=object({operation_id:deliveryId,resume_id:deliveryId,budget_ms:integer(1000,1800000)});
export const nodeOutputReadInputSchema=object({operation_id:id,source_operation_id:id,read:object({ports:array(integer(0,1),2),sample_rows:integer(0,100),require_exact_numbers:boolean},[]),budget_ms:integer(1,1800000)},['operation_id','source_operation_id']);
const unionObject=branches=>({type:'object',properties:{...Object.assign({},...branches.map(branch=>branch.properties)),
  kind:{enum:[...new Set(branches.flatMap(branch=>branch.properties.kind?.const?[branch.properties.kind.const]:[]))]}},
  additionalProperties:false,oneOf:branches});
export const nodeReadInputSchema=unionObject([nodeOutputReadInputSchema,javascriptSourceInitialSchema,javascriptSourceContinuationSchema,javascriptContextInitialSchema]);
export const nodeReadOutputSchema=unionObject([nodeJobResultSchema,javascriptSourceReceiptSchema,javascriptContextReceiptSchema]);
const tool=(name,description,inputSchema,readOnlyHint=false)=>({name,description,inputSchema,
 outputSchema:name==='dock_node_read'?nodeReadOutputSchema:name.startsWith('dock_node_')?nodeJobResultSchema:deliveryJobResultSchema,
 annotations:{readOnlyHint,destructiveHint:!readOnlyHint,openWorldHint:false}});
export const nodeApiTools=Object.freeze([
 tool('dock_node_read','Without kind: execute and read an already completed local table node using source_operation_id and a NEW operation_id. With kind:source: read the full saved source of one prepared existing JavaScript node without Execute; use document_id, full workflow_ref, node, and a stable operation_id. The response contains one exact bounded chunk and a SHA-256. Continue with the same operation_id, returned opaque cursor and expected_source_sha256 until cursor is null. Every chunk reopens and discards the owned wizard; a changed source or uncertain Close refuses further reading. Source reads do not save the package. Never relaunch an uncertain read under a new ID.',
  nodeReadInputSchema),
 tool('dock_node_apply','Candidate node operation: UTF-8 text export, Collapse Columns, Missing Values, Date/time, Duplicate/Contradiction marking, text import, expression Calculator, aggregate Grouping, CrossTable, Sorting, Replacement, Field Parameters, Row Filter, Join, or Union when its handler is installed. Replacement uses exact mode with rules per input_field name, matching type string/integer/real, typed from/to pairs, explicit other keep/null/value, string case_sensitive or numeric precision=0, and global output_mode replace/add. Each requested field replaces its complete internal table; unlisted fields remain unchanged. New nodes require rules and output_mode; existing parameters={} preserves them. Integer values beyond safe JS range use decimal strings. Null, empty string and literal null are distinct. Remaining real explicit values are limited to two decimal places by the native Loginom 7.4.2 editor; exact pairs retain their verified precision. Regex, external tables and type conversions are unsupported. Duplicates uses mark with complete input_fields and output_fields arrays of exact source names. At least one input field is required; the output list may be empty. All other fields get unspecified usage. Roles replace the complete previous configuration. All rows and source columns are retained; four service fields mark every duplicate, so Duplicate=false removes all copies. Mapping overrides and service-name collisions are rejected. Date/time uses mode calendar and fields=[{field:{kind:input_field,name},transformations:[{operation,name,label}]}]. Supported operations: year, quarter, month, day_of_month, hour, year_start, year_end, quarter_start, quarter_end, month_start, month_end, date. Inputs must already be datetime. Transformations replace the complete selection for each named field; other date fields are preserved. Existing parameters={} preserves all saved settings; transformations=[] explicitly clears one field. Output mappings address configured names and may reorder fields or exclude passthrough inputs. An explicit date output layout disables autosync; autosync=true with a fields layout is rejected. Generated date fields cannot be excluded. ISO weeks, string formats and timezone conversion are unsupported. Missing Values uses preprocessing.data_recovery / impute, explicit fields [{field:{kind:input_field,name},method:mean|constant,value?}], max_nulls_percent=0..100 integer and ordered=false. Mean requires continuous integer/real; constant requires discrete string and explicit string value. Fields replace the entire processing set; omitted fields are disabled. Existing parameters={} preserves supported saved settings. Remaining Nulls depend on the threshold; execution does not guarantee complete filling. Collapse Columns uses mode unpivot with complete ordered information/transposed input_field references and explicit ignore_empty for a new node; existing parameters={} preserves roles and policy. Input variant is deferred. Native output is information fields plus Names, DisplayNames, Values (scalar for homogeneous fields, variant for mixed fields), DataTypes. Output mappings support explicit exclusions. read.coverage defaults to sample (at most 10 rows). Collapse or CrossTable coverage full requests every cell in exact_table (at most 50 rows, 8 columns and 1 MiB serialized response), or refuses. It requires a same-session byte-verified local text import and completed executions. Collapse uses an isolated import→Collapse graph; CrossTable uses a verified import→CrossTable or import→Collapse→CrossTable chain, including the prepared source after package reopen. Native integer64/real64 are lossless strings with native bytes; datetime is native_serial_only OADate bytes, not civil time or epoch. Unknown or dynamic provenance refuses full. Ordinary sample reads obtain values directly from the completed output port. Both require_exact_numbers values preserve exact supported scalars; true refuses unverified Variant, nonfinite real and ambiguous datetime values. Text export uses exports.text/mode delimited with one table input and read={ports:[],sample_rows:0,require_exact_numbers:false}. New export requires explicit CSV/TSV destination inside the selected Loginom export directory, encoding UTF-8, delimiter (; , or tab), header (names/labels/none), bom, line_ending (LF/CRLF), decimal_separator, null_marker and text_qualifier double quote. For millisecond time export request time_format=hh:nn:ss.zzz. Native Loginom exports negative zero as 0 and may omit nonzero milliseconds at midnight even with zzz. Warn the user about these native limitations; do not claim fully exact CSV export. Existing parameters are a patch; variables, fixed width and requested port mappings are unsupported. Existing file destinations reject by default; overwrite replace requires an explicit assigned destination each time. Execute returns output.file_artifacts with actual native bytes/SHA and fresh execution binding. Done/Close produce no file receipt. Union uses append_all and retains duplicate rows. Input 0 is the main table; inputs 1–14 are ordered joined tables. Supply explicit prefixes={enabled,name,label} and tables=[{port,fields:[{source,main}]}]. Every joined field needs its exact source name and a main field name or null for a separate output column. Types must match; no implicit conversions. Existing Union requests also declare all tables; adding an input preserves its node identity. Join uses mode inner/left, ordered keys [{left,right}], explicit case_sensitive and include_joined_keys booleans, with input 0 left and input 1 right. Mappings address both inputs and output 0. Existing Join parameters={} preserves saved settings and requires its actual mode. Rename conflicting input field names through explicit mappings before joining. Row Filter uses mode conditions with a nonempty groups array: each group is AND, groups are OR. Every condition identifies field={kind:input_field,name} or field={kind:row_number}, an explicit scalar type and operator, with value, lower/upper or values as required. String value predicates require explicit case_sensitive; is_null/not_null must omit it. Date literals use local ISO including seconds (optional three millisecond digits). Continuous datetime scalar/range editors accept only whole seconds. Discrete datetime fields support scalar and range milliseconds. List predicates retain milliseconds. Groups replace the complete previous filter. Existing filters may use parameters={} to preserve and validate their complete saved conditions without rewriting them. Empty groups, variables and variant types are unsupported. Filter Execute requires read.ports=[0,1]; both outputs share one fresh execution and have independent port schemas. Field Parameters uses mode scalar and changes: each change identifies an input_field/name and patches name, label, scalar type, data_kind, usage, or excluded. Unspecified properties are preserved; output selection and order use mappings. Existing Field Parameters reexecution without edits uses parameters={changes:[]}, inputs=[], mappings=[]. For exact conversion/value checks set read.require_exact_numbers=true; false preserves unverified values with explicit precision limitations. Sorting uses mode keys: ordered keys with field input_field/name, direction ASC/DESC, explicit case_sensitive for string/variant fields, optional compare_with_locale (true for new nodes, preserved for existing). Existing sorting parameters={} preserves keys. Grouping uses ordered group_by input_field names and a full measures list (field, function, name, label); supported functions are sum/count/avg/min/max, count includes null rows. Import source needs only artifact_id and upload_operation_id from a verified delivery; the client resolves bytes and SHA-256 locally. Optional legacy bytes/sha256 must match when supplied. Import settings are required. Calculator accepts ordered expressions with new/existing targets and preserves unrequested settings; optional order lists every resulting expression name. New expressions require name, label, type, formula, replace. Done saves without executing; Close discards the draft and rejects Calculator input mappings, which require a separate committed wizard; Execute reads output 0 for single-output types. Done/Close require read.ports=[]. Poll the SAME operation_id; timeout never restarts work. Save the package separately. LinReg apply: применить уже обученную модель к текущему входу без переобучения.',nodeApplyInputSchema),
 tool('dock_node_resume','Continue the SAME known operation by operation_id using its locally retained original request. Retains accepted phases; unresolved effects or lost document refuse continuation. Full identical requests remain supported for diagnostics.',{...nodeApplyInputSchema,required:['operation_id']}),
 tool('dock_node_status','Read local state and accepted progress without browser access or re-execution.',operation,true),
 tool('dock_node_wait','Wait up to timeout_ms (0–60000 milliseconds, maximum 60 seconds) for the SAME worker. Timeout returns running; wait again on the same operation_id, never infer termination or start a replacement.',object({operation_id:id,timeout_ms:integer(0,60000)},['operation_id']),true),
 tool('dock_node_cancel','Request local cancellation. Partial effects remain; poll until cleanup settles. Does not stop an identified server execution.',operation),
 tool('dock_node_stop','Request native stop only for an identified server execution currently awaited by this node operation. Poll the same worker for confirmed outcome.',operation),
]);
export const deliveryApiTools=Object.freeze([
 tool('dock_artifact_deliver','Deliver an authorized artifact. The application enforces a size-based minimum budget and may renew it once on a confirmed pre-upload resume. Files over 16 MiB start asynchronously and return operation_id; poll dock_artifact_delivery_status no more often than every 5 seconds until ready, cancelled, failed or uncertain. Large files use exact native FileStore size, without download. Smaller files retain byte verification. Retain operation_id after timeout or uncertainty; never reupload with a replacement ID.',delivery),
 tool('dock_artifact_delivery_cancel','Request native cancellation of the SAME large-file operation. Poll status until cancelled or uncertain. Only confirmed sender stop and removal of the owned partial file count as cancelled.',operation),
 tool('dock_artifact_delivery_status','Read the retained delivery job without browser calls. A failed tool wait does not prove transfer termination.',operation,true),
 tool('dock_artifact_delivery_resume','Explicitly resume the SAME known delivery job after inspecting status. Uses the original upload receipt; never repeats an unresolved download. Requires the original live runtime and unchanged grant.',resumeDelivery),
]);
export const isNodeApiTool=name=>[...nodeApiTools,...deliveryApiTools].some(tool=>tool.name===name);
export function validateNodeApplyEnvelope(args) {
 const javascript=args.target?.type==='programming.javascript';
 if(javascript){
  if(args.mode!=='script')throw Error('Invalid parameters.mode: programming.javascript requires script');
  validateActionParameters(javascriptParametersSchema,args.parameters,'parameters.parameters');
  if(args.read?.coverage==='full'&&(args.finish!=='execute'||JSON.stringify(args.read.ports)!=='[0]'
    ||args.read.sample_rows!==100||args.read.require_exact_numbers!==true))
   throw Error('Invalid parameters.read.coverage: JavaScript full UI read requires executed port 0, 100 rows and exact numbers');
  return args;
 }
 if(args.mode==='script'||Object.keys(javascriptParametersSchema.properties).some(key=>key!=='columns'&&Object.hasOwn(args.parameters??{},key)))
  throw Error('Invalid parameters.target.type: JavaScript mode and fields require programming.javascript');
 if(Object.hasOwn(args.parameters??{},'columns')){
  if(args.target?.type!=='transform.cross_table')throw Error('Invalid parameters.target.type: columns require transform.cross_table or programming.javascript');
  validateActionParameters(crossTableParametersSchema.properties.columns,args.parameters.columns,'parameters.parameters.columns');
 }
 return args;
}
export async function dispatchNodeApi(runtime,name,args,{signal,scanReceipt}={}) {
 const definition=runtime.tools.find(tool=>tool.name===name);
 if(!definition||!isNodeApiTool(name))throw Error('Node operation tool is unavailable in this session');
 if(name==='dock_node_read'){
  if(args?.kind==='source')validateJavascriptSourceReadRequest(args);
  else if(args?.kind==='context')validateJavascriptContextReadRequest(args);
  else validateActionParameters(nodeOutputReadInputSchema,args);
 }else validateActionParameters(definition.inputSchema,args);
 if(name==='dock_node_apply'||name==='dock_node_resume'&&Object.keys(args).length>1)validateNodeApplyEnvelope(args);
 signal?.throwIfAborted();
 switch(name){
  case 'dock_node_read':return runtime.startNodeRead(args,{signal});
  case 'dock_node_apply':return runtime.startNodeApply(args,{scanReceipt});
  case 'dock_node_resume':
   if(Object.keys(args).length>1)validateActionParameters(nodeApplyInputSchema,args);
   return runtime.startNodeApply(args,{resume:true});
  case 'dock_node_status':return runtime.nodeApplyStatus(args.operation_id);
  case 'dock_node_wait':return runtime.waitNodeApply(args.operation_id,{timeoutMs:args.timeout_ms??1000,signal});
  case 'dock_node_cancel':return runtime.cancelNodeApply(args.operation_id);
  case 'dock_node_stop':return runtime.stopNodeApply(args.operation_id);
  case 'dock_artifact_deliver':return runtime.deliverArtifact(args,{signal});
  case 'dock_artifact_delivery_cancel':return runtime.cancelArtifactDelivery(args.operation_id);
  case 'dock_artifact_delivery_status':return runtime.artifactDeliveryStatus(args.operation_id);
  case 'dock_artifact_delivery_resume':return runtime.resumeArtifactDelivery(args,{signal});
 }
}
