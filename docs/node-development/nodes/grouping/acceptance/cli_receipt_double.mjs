// Offline drivers only. Use the actual product's applyNode and fsync journal.
// No browser, model, Loginom, or native observations are created by this file.
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const lib=process.env.GROUPING_EVIDENCE_LIB
 ?pathToFileURL(resolve(process.env.GROUPING_EVIDENCE_LIB)+'/')
 :new URL('../../../../../packages/loginom-runtime/client/lib/',import.meta.url);
const {applyNode}=await import(new URL('node-apply.mjs',lib));
const {createExecutionJournal}=await import(new URL('execution-journal.mjs',lib));
const directory=resolve(process.argv[2]);await mkdir(directory,{recursive:true});
if((await readdir(directory)).length)throw Error('Offline double requires an empty output directory');
const pins={session_id:'offline-double',runtime_revision:'offline-product',manifest_sha256:'offline-manifest',target:{loginom_build:'7.4.2',profile_id:'offline-double'}};
const journal=createExecutionJournal({directory,metadata:{sessionId:pins.session_id,clientRevision:pins.runtime_revision,actionManifestDigest:pins.manifest_sha256,targetIdentity:pins.target}});
const csv=await readFile(new URL('data/five-aggregates.csv',import.meta.url));
const matrix=JSON.parse(await readFile(new URL('fixtures/matrix.json',import.meta.url),'utf8'));
const expected=matrix['five-aggregates.csv'].expected;
const workflow_ref={workflow_id:'workflow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Сервер',label:''}]};
const owner=node_id=>({document_id:'doc',workflow_id:'workflow',node_id});
const inputSchema=[{name:'Region',label:'Region',type:'string'},{name:'Amount',label:'Amount',type:'real'},{name:'RowID',label:'RowID',type:'integer'}];
const source={artifact_id:'double-artifact',upload_operation_id:'double-upload',bytes:csv.length,sha256:createHash('sha256').update(csv).digest('hex')};
const settings={source:{encoding:'UTF-8',rows_to_skip:0,first_line_as_title:true,source_path:'/offline/five-aggregates.csv'},format:{delimiter:';',text_qualifier:'"',decimal_separator:'.',null_marker:'\\N'},columns:inputSchema.map(c=>({...c,used:true}))};
const request=(operation_id,type,mode)=>({operation_id,contract_revision:'1.0.0',document_id:'doc',workflow_ref,target:{kind:'existing',type,ref:owner(type==='imports.text'?'import':'grouping')},inputs:[],mode,parameters:{},mappings:[],finish:'execute',read:{ports:[0],sample_rows:100,require_exact_numbers:true},budgets:{configure_ms:1000,execute_ms:1000,total_ms:10000}});
const upstream=request('source-import','imports.text','delimited');upstream.parameters={source,settings};
const grouping=request('grouping','transform.group_data','aggregate');grouping.inputs=[{input:0,source:owner('import'),output:0}];
grouping.parameters={group_by:[{kind:'input_field',name:'Region'}],measures:['sum','count','avg','min','max'].map(fn=>({field:{kind:'input_field',name:'Amount'},function:fn,name:'Amount_'+fn,label:'Amount_'+fn}))};
const edge={source:'import',output:0,target:'grouping',input:0};
const typed=(schema,rows)=>rows.map(row=>schema.map(c=>({type:c.type,is_null:row[c.name]===null,value:c.type==='integer'?String(row[c.name]):row[c.name]})));
const good=value=>({verified:true,cleanup_complete:true,effect_possible:false,...value});
for(const r of [upstream,grouping]){
 const group=r===grouping,node=r.target.ref,execution_id='doc:process-root:'+(group?'2':'1');
 const port={port:0,port_guid:group?'group-port':'source-port',fresh:true,execution_id,row_count:group?expected.rows.length:0,schema:group?expected.columns:inputSchema,sample:group?typed(expected.columns,expected.rows):[],sample_rows:group?expected.rows.length:0,sample_complete:true};
 const mapping={source_fields:inputSchema,target_fields:inputSchema};
 const drivers={verifySource:async()=>good(group?{}:{source}),prepareTarget:async()=>{
  if(group)await journal({operation_id:r.operation_id,phase:'node_target_checkpoint',internal_provenance:'node_target_v1',target_state:{final_graph:{complete:true,document_id:'doc',workflow_ref,nodes:[{ref:owner('import'),type:'imports.text'},{ref:node,type:r.target.type}],links:[edge]}}});
  return good({node,target:{status:'SUCCEEDED',node:{ref:node,type:r.target.type},links:group?[edge]:[]}});
 },mapPorts:async()=>good({native_mapping:mapping}),openWizard:async()=>good({}),finish:async mode=>good({mode,settings_applied:true,node_context:{...node,verified:true},execution_started:false,execution_id:null}),
 finishGraph:async mode=>good({mode,settings_applied:true,node_context:{...node,verified:true},execution_started:true,execution_id}),waitExecution:async()=>good({status:'completed',execution_id}),readOutput:async()=>good({status:'complete',execution_id,evidence_ref:'double-read',ports:[port]})};
 if(!group)drivers.finish=drivers.finishGraph;
 const handler={revision:'1',modes:[r.mode],validate:()=>{},configure:async()=>good({configuration:{input_fields:inputSchema}}),...(group?{output_wizard:'separate'}:{})};
 // Deterministic procedure clock: fsync wall time is not a latency fixture.
 const result=await applyNode({request:r,operation:{id:r.operation_id},handlers:new Map([[r.target.type,handler]]),drivers,record:journal,now:()=>1});
 if(result.status!=='SUCCEEDED')throw Error(JSON.stringify(result));
}
for(const [name,value] of Object.entries({'request.json':grouping,'pins.json':pins,'expected.json':expected}))await writeFile(resolve(directory,name),JSON.stringify(value,null,2));
await writeFile(resolve(directory,'source.csv'),csv);
