// Private discovery only. Sources and fixed expected values are separate data;
// importing this module never evaluates a Loginom source or derives its oracle.
import {createHash} from 'node:crypto';
import {javascriptEngineProbes,inputTextProbe} from './javascript-engine-probes.mjs';
import {javascriptBusinessProbes} from './javascript-business-probes.mjs';
import {javascriptStopProbe} from './javascript-stop-case.mjs';
import {javascriptBridgeProbe} from './javascript-bridge-probe.mjs';
import {javascriptColumnNameProbes} from './javascript-column-names.mjs';
import {describeJavascriptKnowledge} from '../../client/lib/javascript-knowledge.mjs';
import {verifyJavascriptMismatchTable,verifyJavascriptPreviousExecution} from './javascript-mismatch-probe.mjs';

const need=(v,m)=>{if(!v)throw Error(m);};
const hash=s=>createHash('sha256').update(s,'utf8').digest('hex');
const column=type=>[{name:'Result',label:'Result',type}];
const source=(type,expression)=>'import {InputTable,OutputTable,DataType} from "builtIn/Data";\n'
  +'OutputTable.AssignColumns([{Name:"Result",DataType:DataType.'+type+'}]);\n'+expression+'\n';
const rows=expressions=>expressions.map(e=>'OutputTable.Append(); OutputTable.Set("Result", '+e+');').join('\n');
const knowledge=describeJavascriptKnowledge('7.4.2','1.0.0');
need(knowledge.version==='1.0.0'&&knowledge.examples.length===2,'Fixed knowledge v1 examples changed');
const knowledgeProbes=knowledge.examples.map(example=>{
  need(['code-table-v1','declared-table-v1'].includes(example.id)
    &&example.id===example.schema_mode+'-table-v1'&&example.input_technical_name==='RowID'
    &&hash(example.source)===example.source_sha256,'Fixed knowledge v1 source identity changed');
  return {id:(example.schema_mode==='declared'?'declared-':'')+'g5-knowledge-v1',scope:'J20-knowledge',
    schema_mode:example.schema_mode,source:example.source,
    schema:[{name:'ObservedID',label:'ObservedID',type:'integer'},{name:'PhaseMarker',label:'PhaseMarker',type:'string'}],
    expected:[['1','JS_G2_TABLE_V1'],['2','JS_G2_TABLE_V1'],['3','JS_G2_TABLE_V1'],
      ['4','JS_G2_TABLE_V1'],['5','JS_G2_TABLE_V1'],['6','JS_G2_TABLE_V1']],expectation:'fixed',
    knowledge:{version:knowledge.version,knowledge_sha256:knowledge.knowledge_sha256,
      example_id:example.id,example_source_sha256:example.source_sha256,validated_for:knowledge.validated_for}};
});
const typed=(id,type,expressions,values,note)=>({id,scope:'G5',source:source(type,rows(expressions)),
  schema:column({String:'string',Boolean:'boolean',Integer:'integer',Float:'real',DateTime:'datetime'}[type]),
  expected:values===null?null:values.map(value=>[value]),note,expectation:values===null?'characterization':'fixed'});

const codeProbes=[
  ...javascriptColumnNameProbes,
  ...knowledgeProbes,
  ...javascriptEngineProbes.map(p=>({...p,id:'engine-'+p.id,schema:column('string'),
    expected:p.expected?.map(v=>[v])??null,expectation:p.expectedError?'diagnostic':'fixed'})),
  {...inputTextProbe('Customer'),id:'engine-input-text',schema:column('string'),expectation:'fixed',
    // Independent literals from pinned sales.csv, including preserved padding.
    expected:[['["Alpha","  alpha  ","  ALPHA  "]'],['["BETA","beta","BETA"]'],
      ['["Alpha","alpha","ALPHA"]'],['["Гамма","гамма","ГАММА"]'],['["Ёж","ёж","ЁЖ"]'],['["delta","delta","DELTA"]']]},
  {id:'g5-native-real',scope:'G5',native_input_fixture:'real',
    source:'import {InputTable,OutputTable,DataType} from "builtIn/Data";\n'
      +'OutputTable.AssignColumns([{Name:"Value",DataType:DataType.Float}]);\n'
      +'for (let row=0;row<InputTable.RowCount;row++) {\n  OutputTable.Append();\n  OutputTable.Set("Value",InputTable.Get(row,"Value"));\n}\n',
    schema:[{name:'Value',label:'Value',type:'real'}],expected:[[null],[0],[-1.25],[10.125]],expectation:'fixed'},
  {id:'g5-native-civil-datetime',scope:'G5',native_input_fixture:'civil-datetime',
    source:'import {InputTable,OutputTable,DataType} from "builtIn/Data";\n'
      +'OutputTable.AssignColumns([{Name:"Value",DataType:DataType.DateTime}]);\n'
      +'for (let row=0;row<InputTable.RowCount;row++) {\n  OutputTable.Append();\n  OutputTable.Set("Value",InputTable.Get(row,"Value"));\n}\n',
    schema:[{name:'Value',label:'Value',type:'datetime'}],
    expected:[[null],['2024-02-29T23:59:59.123'],['2026-03-29T01:59:59.999']],expectation:'fixed'},
  {id:'g5-native-cardinality-keep2',scope:'G5',native_input_fixture:'cardinality-keep2',
    source:'import {InputTable,OutputTable,DataType} from "builtIn/Data";\n'
      +'OutputTable.AssignColumns([{Name:"Value",DataType:DataType.Integer}]);\n'
      +'for (let row=0;row<InputTable.RowCount;row++) {\n  const value=InputTable.Get(row,"Value");\n  if (value === 2) { OutputTable.Append(); OutputTable.Set("Value",value); }\n}\n',
    schema:[{name:'Value',label:'Value',type:'integer'}],expected:[['2']],expectation:'fixed'},
  {id:'g5-native-cardinality-odd',scope:'G5',native_input_fixture:'cardinality-odd',
    source:'import {InputTable,OutputTable,DataType} from "builtIn/Data";\n'
      +'OutputTable.AssignColumns([{Name:"Value",DataType:DataType.Integer}]);\n'
      +'for (let row=0;row<InputTable.RowCount;row++) {\n  const value=InputTable.Get(row,"Value");\n  if (value % 2 === 1) { OutputTable.Append(); OutputTable.Set("Value",value); }\n}\n',
    schema:[{name:'Value',label:'Value',type:'integer'}],expected:[['1'],['3']],expectation:'fixed'},
  {id:'g5-native-cardinality-duplicate',scope:'G5',native_input_fixture:'cardinality-duplicate',
    source:'import {InputTable,OutputTable,DataType} from "builtIn/Data";\n'
      +'OutputTable.AssignColumns([{Name:"Value",DataType:DataType.Integer}]);\n'
      +'for (let row=0;row<InputTable.RowCount;row++) {\n  const value=InputTable.Get(row,"Value");\n  OutputTable.Append(); OutputTable.Set("Value",value);\n  OutputTable.Append(); OutputTable.Set("Value",value);\n}\n',
    schema:[{name:'Value',label:'Value',type:'integer'}],expected:[['1'],['1'],['2'],['2'],['3'],['3']],expectation:'fixed'},
  {id:'declared-g5-native-cardinality-empty',scope:'G5',native_input_fixture:'cardinality-empty',schema_mode:'declared',
    source:'import {InputTable,OutputTable} from "builtIn/Data";\n// UI-declared Value Integer; deliberately emit no rows.\n',
    schema:[{name:'Value',label:'Value',type:'integer'}],expected:[],expectation:'fixed'},
  {id:'g5-native-integer-outside-safe',scope:'G5',native_input_fixture:'integer-outside-safe',
    source:'import {InputTable,OutputTable,DataType} from "builtIn/Data";\n'
      +'OutputTable.AssignColumns([{Name:"Value",DataType:DataType.Integer}]);\n'
      +'for (let row=0;row<InputTable.RowCount;row++) {\n  OutputTable.Append();\n  OutputTable.Set("Value",InputTable.Get(row,"Value"));\n}\n',
    schema:[{name:'Value',label:'Value',type:'integer'}],expected:null,expectation:'characterization',
    note:'Bounded native int64 input and typed output observation; never promises exact outside-safe identity or arithmetic.'},
  {id:'g5-native-integer-safe',scope:'G5',native_input_fixture:'integer-safe',
    source:'import {InputTable,OutputTable,DataType} from "builtIn/Data";\n'
      +'OutputTable.AssignColumns([{Name:"Value",DataType:DataType.Integer}]);\n'
      +'for (let row=0;row<InputTable.RowCount;row++) {\n  OutputTable.Append();\n  OutputTable.Set("Value",InputTable.Get(row,"Value"));\n}\n',
    schema:[{name:'Value',label:'Value',type:'integer'}],expected:[[null], ["-9007199254740991"], ["0"], ["9007199254740991"]],expectation:'fixed'},
  {id:'g5-native-string',scope:'G5',native_input_fixture:'string',
    source:'import {InputTable,OutputTable,DataType} from "builtIn/Data";\n'
      +'OutputTable.AssignColumns([{Name:"Value",DataType:DataType.String}]);\n'
      +'for (let row=0;row<InputTable.RowCount;row++) {\n  OutputTable.Append();\n  OutputTable.Set("Value",InputTable.Get(row,"Value"));\n}\n',
    schema:[{name:'Value',label:'Value',type:'string'}],expected:[[null], [""], ["null"], ["NULL"], ["0"], ["false"], ["Привет, Ёж 😀"], ["quote\"\\slash\nline"]],expectation:'fixed'},
  {id:'g5-native-boolean',scope:'G5',native_input_fixture:'boolean',
    source:'import {InputTable,OutputTable,DataType} from "builtIn/Data";\n'
      +'OutputTable.AssignColumns([{Name:"Value",DataType:DataType.Boolean}]);\n'
      +'for (let row=0;row<InputTable.RowCount;row++) {\n  OutputTable.Append();\n  OutputTable.Set("Value",InputTable.Get(row,"Value"));\n}\n',
    schema:[{name:'Value',label:'Value',type:'boolean'}],expected:[[null],[false],[true]],expectation:'fixed'},
  typed('g5-null-empty','String',['null','""','"null"','"0"','"false"'],[null,'','null','0','false']),
  typed('g5-undefined','String',['undefined'],null,'Unknown bridge semantics; record typed output or owned failure without choosing an expected value after observation.'),
  typed('g5-boolean','Boolean',['null','false','true'],[null,false,true]),
  typed('g5-real','Float',['null','0','-1.25','10.125'],[null,0,-1.25,10.125]),
  typed('g5-one-output','Integer',['7'],['7']),
  typed('g5-safe-integer','Integer',['-9007199254740991','0','9007199254740991'],['-9007199254740991','0','9007199254740991']),
  typed('g5-outside-safe','Integer',['Number("9007199254740993")'],null,'Characterization only; does not test native input int64 transport or promise exact arithmetic.'),
  ...[['fraction','1.75'],['string','"42"'],['nan','NaN'],['positive-infinity','Infinity'],['negative-infinity','-Infinity']]
    .map(([id,value])=>typed('g5-integer-'+id,'Integer',[value],null,'Integer coercion is unknown; independent isolated case, never alter the safe-integer oracle.')),
  typed('g5-date-civil','DateTime',['null','new Date(2024, 1, 29, 23, 59, 59, 123)'],[null,'2024-02-29T23:59:59.123'],
    'Constructed civil JS Date to native output only; not native input roundtrip or native serial-byte proof.'),
  {id:'g5-named-access',scope:'G5',source:source('Integer','for(let i=0;i<InputTable.RowCount;i++){OutputTable.Append();OutputTable.Set("Result",InputTable.Get(i,"RowID"));}'),
    schema:column('integer'),expected:[['1'],['2'],['3'],['4'],['5'],['6']],expectation:'fixed'},
  {id:'g5-empty-input',scope:'G5',input_variant:'empty',
    source:source('Integer','for(let i=0;i<InputTable.RowCount;i++){OutputTable.Append();OutputTable.Set("Result",InputTable.Get(i,"RowID"));}'),
    schema:column('integer'),expected:[],expectation:'fixed'},
  {id:'g5-name-case',scope:'G5',source:source('Integer','OutputTable.Append();OutputTable.Set("Result",InputTable.Get(0,"rowid"));'),
    schema:column('integer'),expected:null,expectation:'characterization',note:'Named-access case sensitivity is unknown.'},
  {id:'g5-empty-output',scope:'G5',source:source('Integer','// Deliberately append no rows.'),
    schema:column('integer'),expected:[],expectation:'fixed'},
  ...javascriptBusinessProbes(),
  {...javascriptBusinessProbes().find(probe=>probe.id==='p1-business-code-base'),
    id:'c0-code-materialization',scope:'C0-materialization'},
  javascriptBridgeProbe(),
  javascriptStopProbe(),
].map(p=>({...p,schema_mode:p.schema_mode??'code',build:'7.4.2',source_sha256:hash(p.source),status:'not_run'}));

// Operator-only declared counterparts: the authored body and expected values
// stay identical; schema creation belongs to the native wizard.
const declaredIds=new Set(['g5-native-integer-outside-safe','g5-native-civil-datetime','g5-native-integer-safe','g5-native-string','g5-native-boolean','g5-native-real','g5-null-empty','g5-boolean','g5-real','g5-safe-integer',
  'g5-date-civil','g5-named-access','g5-empty-output','g5-one-output','g5-empty-input']);
const probes=[...codeProbes,...codeProbes.filter(probe=>declaredIds.has(probe.id)).map(probe=>{
  const lines=probe.source.split('\n');
  need(lines[1].startsWith('OutputTable.AssignColumns(')&&lines[1].endsWith(');'),
    'Declared fixed source schema statement unavailable');
  const body=lines.filter((_,index)=>index!==1).join('\n');
  return {...probe,id:'declared-'+probe.id,schema_mode:'declared',source:body,source_sha256:hash(body)};
})];

export const javascriptDiscoveryIds=Object.freeze(probes.map(p=>p.id));

export function javascriptDiscoveryProbe(id){
  const matches=probes.filter(p=>p.id===id);
  need(matches.length===1,'Unknown isolated discovery probe');
  return structuredClone(matches[0]);
}

export function javascriptDiscoveryOracle(probe,table){
  const pinned=javascriptDiscoveryProbe(probe?.id);
  need(probe.source===pinned.source&&probe.source_sha256===pinned.source_sha256
    &&probe.input_variant===pinned.input_variant&&probe.native_input_fixture===pinned.native_input_fixture,'Discovery source/input pin changed');
  verifyJavascriptMismatchTable(table);
  const schema=JSON.stringify(table.schema.map(c=>({name:c.name,label:c.label,type:c.type})))===JSON.stringify(pinned.schema);
  const values=pinned.expected!==null&&table.row_count===pinned.expected.length
    &&table.sample.every((row,i)=>row.length===pinned.expected[i].length
      &&row.every((cell,j)=>cell.is_null===(pinned.expected[i][j]===null)&&Object.is(cell.value,pinned.expected[i][j])));
  return {schema_verified:schema,values_verified:values,gate_passed:pinned.expectation==='fixed'&&schema&&values,
    expectation:pinned.expectation,scope:pinned.scope,proof_level:'typed_ui_only',native_bytes_verified:false,gates_closed:[]};
}

export function javascriptDiscoveryWizardDiagnostic({probe,identity,stage,before,after}){
  const pinned=javascriptDiscoveryProbe(probe?.id);
  need(probe.source===pinned.source&&identity?.source_sha256===pinned.source_sha256&&identity.node_id,
    'Wizard diagnostic source/identity differs');
  if(!['next','done'].includes(stage)||before?.owner_verified!==true||after?.owner_verified!==true
    ||after.native_owner_verified!==true||after.wizard_visible!==true||after.pending||after.boundary_refusal)return null;
  const messages=after.messages?.filter(message=>!before.messages?.some(old=>old.id===message.id));
  if(!messages?.length)return null;
  need(messages.length<=64&&messages.every(m=>typeof m.id==='string'&&m.id&&typeof m.text==='string'
    &&m.text.length>0&&m.text.length<=4096),'Bounded fresh wizard diagnostic required');
  return {id:pinned.id,status:'owned_wizard_diagnostic',stage,source_sha256:pinned.source_sha256,node_id:identity.node_id,
    messages:structuredClone(messages),explicit_execute_dispatched:false,execution:'ambiguous',absence_proves_no_execution:false,
    syntax_support:'not_determined',class_observed:null,position_observed:null,gate_passed:false,native_bytes_verified:false,gates_closed:[]};
}

export function javascriptDiscoveryErrorButtonDiagnostic({probe,identity,error}){
  const pinned=javascriptDiscoveryProbe(probe?.id);
  need(probe.source===pinned.source&&identity?.source_sha256===pinned.source_sha256&&identity.node_id,
    'Error button source/identity differs');
  need(error?.identity?.effect_id===identity.effect_id&&error.identity.node_id===identity.node_id
    &&error.dialog_closed===true&&error.native_owner_verified===true&&error.page_tid
    &&typeof error.dialog_text==='string'&&error.dialog_text.length>0&&error.dialog_text.length<=4096,
    'Owned native wizard error dialog required');
  const classObserved=error.dialog_text.match(/(?:^|\n)([A-Za-z]+Error):/)?.[1]??null;
  const position=error.dialog_text.match(/\(:([0-9]+):([0-9]+)\)/);
  return {id:pinned.id,status:'owned_wizard_refusal',stage:error.stage,source_sha256:pinned.source_sha256,
    node_id:identity.node_id,button_tid:error.button_tid,page_tid:error.page_tid,
    tooltip:error.tooltip,tooltip_truncated:error.tooltip_truncated,dialog_text:error.dialog_text,
    dialog_text_truncated:error.dialog_text_truncated,dialog_closed:true,
    class_observed:classObserved,position_observed:position?{line:Number(position[1]),column:Number(position[2])}:null,
    explicit_execute_dispatched:false,execution:'not_started_by_operator',
    syntax_support:classObserved==='SyntaxError'?'native_parse_refusal':'not_determined',
    gate_passed:false,native_bytes_verified:false,gates_closed:[]};
}

export async function observeJavascriptDiscovery({probe,node,execution,previousExecution,readOutput,record,onProgress=async()=>{},deadline,now=Date.now}){
  const pinned=javascriptDiscoveryProbe(probe?.id);
  need(probe.source===pinned.source&&hash(probe.source)===pinned.source_sha256
    &&probe.input_variant===pinned.input_variant
    &&execution?.verified===true&&execution.owner_verified===true&&execution.cleanup_complete===true
    &&['completed','failed'].includes(execution.status)&&execution.trial?.phase===(['C0-materialization','G3-bridge'].includes(pinned.scope)?'materialization-final':'initial')
    &&execution.trial.source_sha256===pinned.source_sha256&&execution.trial.node_id===node?.node_id
    &&['document_id','workflow_id','node_id'].every(k=>node?.[k]&&execution.fresh_baseline?.node?.[k]===node[k])
    &&execution.execution_id&&execution.group_id&&Array.isArray(execution.fresh_baseline.roots)
    &&execution.launch_identity?.execution_id===execution.execution_id&&execution.launch_identity.group_id===execution.group_id
    &&execution.launch_identity.root_id===execution.fresh_baseline.root_id
    &&typeof execution.launch_identity.group_record_id==='string'&&execution.launch_identity.group_record_id
    &&['document_id','workflow_id','node_id'].every(k=>execution.launch_identity.node?.[k]===node[k])
    &&!execution.fresh_baseline.roots.some(p=>p.process_id===execution.group_id),'Discovery execution owner/source/freshness incomplete');
  if(['C0-materialization','G3-bridge'].includes(pinned.scope)){
    need(previousExecution?.trial?.phase==='initial'&&previousExecution.trial.source_sha256===pinned.source_sha256
      &&previousExecution.execution_id!==execution.execution_id,'C0 requires distinct same-source materialization and read executions');
    verifyJavascriptPreviousExecution(execution.fresh_baseline,previousExecution);
  }
  const result={id:pinned.id,source_sha256:pinned.source_sha256,status:'execution_terminal',execution,
    execution_started:true,gate_passed:false,output:null,scope:pinned.scope,expectation:pinned.expectation,
    proof_level:'typed_ui_only',native_bytes_verified:false,gates_closed:[]};
  await onProgress(result);await record({phase:'discovery_execution_terminal',...result});
  need(now()<deadline,'Original discovery deadline expired');
  if(execution.status==='failed'){
    need(execution.ownership_source==='native_process_model_identity_and_show_node'
      &&execution.error_source==='native_child_error_details'&&execution.output_refreshed===false
      &&['document_id','workflow_id','node_id'].every(k=>execution.node?.[k]===node[k])
      &&typeof execution.error?.message==='string'&&execution.error.message,'Owned native diagnostic required');
    result.status='owned_native_failure';result.diagnostic={...execution.error,
      class_observed:execution.error.class??null,position_observed:execution.error.position??null,
      expected_family:pinned.expectation==='diagnostic'?pinned.id:null,
      sync_marker_observed:pinned.id==='engine-sync-throw'&&execution.error.message.includes('JS_DISCOVERY_SYNC_THROW')};
  }else{
    result.output=await readOutput();
    need(now()<deadline,'Original discovery deadline expired');
    result.oracle=javascriptDiscoveryOracle(pinned,result.output);result.gate_passed=result.oracle.gate_passed;
    result.status=result.gate_passed?'typed_oracle_verified':'typed_characterization';
  }
  await onProgress(result);await record({phase:'discovery_probe_observed',...result});return result;
}
