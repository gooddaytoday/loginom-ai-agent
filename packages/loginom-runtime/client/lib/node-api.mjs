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
export const slidingWindowParametersSchema={
  "type": "object",
  "properties": {
    "windows": {
      "type": "array",
      "minItems": 0,
      "maxItems": 128,
      "description": "Replace all windows; unlisted=0/0. Required on new; omit on existing to preserve.",
      "items": {
        "type": "object",
        "properties": {
          "field": {
            "type": "string",
            "minLength": 1,
            "maxLength": 128,
            "description": "Observed technical input name; unique in windows."
          },
          "history": {
            "type": "integer",
            "minimum": 0,
            "description": "Previous-row count; 0 disables history.",
            "maximum": 134217727
          },
          "horizon": {
            "type": "integer",
            "minimum": 0,
            "description": "Following-row count; 0 disables forecast.",
            "maximum": 134217727
          }
        },
        "required": [
          "field",
          "history",
          "horizon"
        ],
        "additionalProperties": false
      }
    },
    "incomplete_records": {
      "type": "string",
      "enum": [
        "keep_incomplete",
        "drop_added",
        "drop_all_incomplete"
      ],
      "description": "keep_incomplete expands edges; drop_added keeps originals; drop_all_incomplete trims edges, not source NULL. Required on new; omit on existing to preserve."
    }
  },
  "required": [],
  "additionalProperties": false
};
export const dateTimeParametersSchema=object({fields:array(object({field:groupingFieldSchema,transformations:array(object({operation:choice(...Object.keys(DATE_TIME_OPERATIONS)),name:text(128),label:text(120)}),12)}),128)},[]);
export const missingValuesFieldSchema=object({field:groupingFieldSchema,method:choice('mean','constant'),value:{type:'string',maxLength:2048}},['field','method']);
export const missingValuesParametersSchema=object({fields:array(missingValuesFieldSchema,128,1),max_nulls_percent:{type:'integer',minimum:0,maximum:100},ordered:{const:false}},[]);
export const collapseParametersSchema=object({information:array(groupingFieldSchema,128),transposed:array(groupingFieldSchema,128,1),ignore_empty:boolean},[]);
export const logRegressionParametersSchema=object({logistic:{"type":"object","properties":{"input_fields":{"type":"array","items":{"type":"string","minLength":1,"maxLength":128},"minItems":1,"maxItems":128,"description":"Complete continuous numeric predictor names; other fields pass through."},"target_field":{"type":"string","minLength":1,"maxLength":128,"description":"One discrete string target with exactly two non-null classes."},"event":{"type":"string","minLength":1,"maxLength":128,"description":"Exact event category label, resolved from the observed class list, never an index."},"threshold":{"type":"number","minimum":0,"maximum":1,"description":"Explicit cutoff: event if probability >= threshold."}},"required":["input_fields","target_field","event","threshold"],"additionalProperties":false}});
export const linRegressionParametersSchema=object({input_fields:{...array(text(128),128,1),description:'Complete list of continuous numeric predictor field names. Identifier and other unlisted fields are retained and ignored.'},target_field:{...text(128),description:'One continuous numeric response name; distinct from all predictors.'}},['input_fields','target_field']);
export const corrAnalysisParametersSchema=object({first_set:{...array({...text(128),description:'Exact technical numeric input field name.'},128,1),uniqueItems:true,description:'Complete first set of numeric technical input field names; native source order.'},second_set:{...array({...text(128),description:'Exact technical numeric input field name.'},128,1),uniqueItems:true,description:'Complete second set of numeric technical input field names. Both sets required for new nodes; existing omission preserves.'}},[]);
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
 target:object({kind:choice('new','existing'),type:choice('datamining.log_regression','research.corr_analysis','transform.sliding_window','imports.excel','integration.rest_request','datamining.lin_regression','datamining.clustering','transform.cross_table','exports.text','transform.collapse_columns','preprocessing.data_recovery','transform.date_time','research.duplicates','imports.text','transform.calculator','transform.group_data','transform.sorting','transform.replace_columns','transform.reform_columns','transform.filter_data','transform.join_data','transform.union_data','programming.javascript'),label:{...text(200),pattern:'^(?!\\s*$)[^;|<>"\'\\\\\\u0000-\\u001f]+$',description:'Optional nonblank node caption, 1–200 UTF-16 units. No ; | < >, single/double quotes, backslash or U+0000..U+001F. Omit if unneeded; conditions and formulas in parameters, not target.label.'},ref,
  position:{...object({x:{type:'number',minimum:NODE_POSITION_MIN,maximum:10000},y:{type:'number',minimum:NODE_POSITION_MIN,maximum:10000}}),description:'Model coordinates; safe label/port margin. Omit=auto; explicit unchanged.'}},['kind','type']),
 inputs:array(object({source:ref,output:integer(0,99),input:integer(0,99)}),15),
 mode:choice('pearson','lag','apply','xlsx','request','enter','k_means','pivot','unpivot','impute','calendar','mark','delimited','expression','aggregate','keys','scalar','conditions','inner','left','right','full','difference','append_all','exact','regex','script'),parameters:object({logistic:logRegressionParametersSchema.properties.logistic,...corrAnalysisParametersSchema.properties,...slidingWindowParametersSchema.properties,excel:excelSettingsSchema,...restRequestParametersSchema.properties,target_field:linRegressionParametersSchema.properties.target_field,...clusteringParametersSchema.properties,...crossTableParametersSchema.properties,...textExportParametersSchema.properties,information:collapseParametersSchema.properties.information,transposed:collapseParametersSchema.properties.transposed,ignore_empty:boolean,input_fields:duplicatesParametersSchema.properties.input_fields,output_fields:duplicatesParametersSchema.properties.output_fields,
