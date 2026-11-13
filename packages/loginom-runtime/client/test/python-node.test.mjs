import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {inspectPythonSourcePolicy,pythonCodeSkeleton} from '../lib/python-source-policy.mjs';
import {validatePythonParameters} from '../lib/python-parameters.mjs';
import {configurePython} from '../lib/python-procedure.mjs';
import {pythonConfigurationReadback} from '../lib/python-readback.mjs';
import {readPythonOutputs} from '../lib/python-output.mjs';
import {makePythonColumnsCode,configurePythonColumnsPage} from '../lib/python-columns.mjs';
import vm from 'node:vm';
import {validateNodeApplyEnvelope} from '../lib/node-api.mjs';
import {NODE_TYPES} from '../lib/node-contracts.mjs';

const acceptance=new URL('../../../../docs/node-development/nodes/programming-python/acceptance/',import.meta.url);
const stdlib=readFileSync(new URL('python-stdlib/data/calculation.py',acceptance),'utf8');
const pandas=readFileSync(new URL('python-pandas/data/pandas_calculation.py',acceptance),'utf8');
const sha=text=>createHash('sha256').update(text,'utf8').digest('hex');
const request=(kind='new',extra={})=>({target:{kind,type:'programming.python'},inputs:[{input:0}],mappings:[],read:{ports:[0]},finish:'execute',...extra});
const declared=[['Id','integer'],['Amount','real'],['AmountScaled','real'],['Text','string'],['Flag','boolean'],['Date','datetime']].map(([name,type])=>({name,label:name,type}));

test('acceptance sources pass python-module-v1 with the file digest',()=>{
 for(const source of [stdlib,pandas]){
  const policy=inspectPythonSourcePolicy(source);
  assert.equal(policy.status,'ADMITTED',JSON.stringify(policy));
  assert.equal(policy.source_sha256,sha(source));
 }
});

for(const [source,reason] of [
 ['import os\n','module:os'],['import subprocess as s\n','module:subprocess'],['from urllib.request import urlopen\n','module:urllib.request'],
 ['import math, socket\n','module:socket'],['from . import x\n','module:.'],['x = open("f").read()\n','name:open'],['eval("1")\n','name:eval'],
 ['exec("x=1")\n','name:exec'],['__import__("os")\n','name:__import__'],['import importlib\n','module:importlib'],['y = ().__class__\n','name:__class__'],
 ['import pandas as pd\npd.read_csv("http://h/x.csv")\n','attribute:read_csv'],['import pandas as pd\nframe.to_csv("/tmp/x")\n','attribute:to_csv'],
 ['import numpy as np\nnp.load("x.npy")\n','attribute:load'],['print(f"{open(1)}")\n','name:open'],['x = "a\r\n"','source_bounds'],['x = "a\n','unterminated_string'],
])test('policy refuses '+reason,()=>{
 const policy=inspectPythonSourcePolicy(source);
 assert.equal(policy.status,'REFUSED');assert.equal(policy.reason,reason);
});

test('policy ignores forbidden words inside comments and plain strings',()=>{
 assert.equal(inspectPythonSourcePolicy('# import os; open(x)\nlabel = "open eval import"\nx = \'\'\'\nimport socket\n\'\'\'\n').status,'ADMITTED');
 assert.equal(pythonCodeSkeleton('a = "x#y" # c\n').code,'a = "   " \n');
});

test('parameters: new nodes need code and schema mode; code mode forbids columns',()=>{
 validatePythonParameters({source_text:pandas,schema_mode:'code'},'script',request());
 validatePythonParameters({source_text:stdlib,schema_mode:'declared',columns:declared},'script',request());
 validatePythonParameters({},'script',request('existing'));
 for(const [p,message] of [[{schema_mode:'code'},/requires source_text/],[{source_text:pandas},/schema_mode/],
  [{source_text:pandas,schema_mode:'code',columns:declared},/forbids columns/],[{source_text:stdlib,schema_mode:'declared'},/requires columns/],
  [{source_text:'import os\n',schema_mode:'code'},/python-module-v1 \(module:os at line 1\)/],[{source_text:'x'.repeat(2049),schema_mode:'code'},/source_bounds/]])
  assert.throws(()=>validatePythonParameters(p,'script',request()),message);
 assert.throws(()=>validatePythonParameters({source_text:pandas},'script',request('existing')),/expected_source_sha256/);
 assert.throws(()=>validatePythonParameters({source_text:pandas,schema_mode:'code'},'expression',request()),/mode script/);
 assert.throws(()=>validatePythonParameters({source_text:pandas,schema_mode:'code'},'script',request('new',{read:{ports:[0],coverage:'full'}})),/coverage/);
});

test('public envelope reuses the JavaScript parameter shape for programming.python',()=>{
 const args={target:{kind:'new',type:'programming.python'},mode:'script',parameters:{source_text:pandas,schema_mode:'code'},finish:'execute'};
 assert.equal(validateNodeApplyEnvelope(args),args);
 assert.throws(()=>validateNodeApplyEnvelope({...args,mode:'expression'}),/programming.python requires script/);
 assert.throws(()=>validateNodeApplyEnvelope({...args,read:{ports:[0],coverage:'full'}}),/coverage/);
 assert.equal(NODE_TYPES['programming.python'].palette_group,'Программирование');
 assert.equal(NODE_TYPES['programming.python'].icon_class,'bg-vendor-icon-python');
});

function fakeWizard({generation=false,columns=[],source='import builtin_data\n',editable=true}={}){
 const root='MF;TF;WizrdMCF',owner={document_id:'doc',workflow_id:'wf',node_id:'py'},actions=[];
 let stage='input_mapping';
 const page=()=>stage==='python_columns'?{verified:true,page:'columns',generation,generation_disabled:false,columns:structuredClone(columns)}
  :stage==='python_code'?{verified:true,page:'code',source,separate_process:true,separate_process_disabled:true,writable:editable}:undefined;
 const snapshot=()=>({wizard:{stage,root_tid:root},prepared_node_context:owner,node_python:page(),ui:{elements:[
  {tid:root+';btnNext',ref:'next',allowed_actions:['wizard_step']},
  {tid:root+';PythonColumnsWizard;BooleanPropEdit;ValueControl;DisplayEl',ref:'generation',allowed_actions:['set_checked']},
  {tid:root+';PythonCodeWizard;cmpCodeCM',ref:'code',allowed_actions:['replace_expression']}]}});
 const channel={async observe(o){const s=snapshot();assert.ok(o.ready(s),o.condition);return s;},async perform(o){
  const s=snapshot();assert.ok(o.ready(s),o.condition);const a=o.resolve(s);actions.push(a);
  if(a.verb==='wizard_step')stage=a.expected_stage;
  else if(a.verb==='set_checked')generation=a.checked;
  else if(a.verb==='replace_expression')source=a.text;
 },async configurePythonColumns(wanted){
  assert.equal(stage,'python_columns');assert.equal(generation,false);actions.push({verb:'python_columns',columns:wanted});
  columns=structuredClone(wanted);return {verified:true,columns:structuredClone(wanted)};
 }};
 return {channel,actions,owner};
}

test('code mode turns on generation and writes the script verbatim',async()=>{
 const {channel,actions}=fakeWizard();
 const result=await configurePython(channel,{source_text:pandas,schema_mode:'code'},{request:request()});
 assert.deepEqual(actions.map(a=>a.verb),['wizard_step','set_checked','wizard_step','replace_expression','wizard_step']);
 assert.equal(actions[1].checked,true);
 assert.equal(result.configuration.schema_mode,'code');assert.equal(result.configuration.source_sha256,sha(pandas));
 assert.equal(result.configuration.columns,undefined);assert.equal(result.validation.status,'accepted_by_loginom_next');
});

test('declared mode keeps generation off and writes typed columns before the code',async()=>{
 const empty=fakeWizard();
 const result=await configurePython(empty.channel,{source_text:stdlib,schema_mode:'declared',columns:declared},{request:request()});
 assert.deepEqual(empty.actions.map(a=>a.verb),['wizard_step','python_columns','wizard_step','replace_expression','wizard_step']);
 assert.deepEqual(empty.actions[1].columns,declared);
 assert.deepEqual(result.configuration.columns,declared);assert.equal(result.configuration.schema_mode,'declared');assert.equal(result.configuration.source_sha256,sha(stdlib));
 const same=fakeWizard({columns:declared});
 await configurePython(same.channel,{source_text:stdlib,schema_mode:'declared',columns:declared},{request:request()});
 assert.equal(same.actions.some(a=>['set_checked','python_columns'].includes(a.verb)),false);
 const generated=fakeWizard({generation:true});
 await configurePython(generated.channel,{source_text:stdlib,schema_mode:'declared',columns:declared},{request:request()});
 assert.deepEqual(generated.actions.slice(0,3).map(a=>a.verb),['wizard_step','set_checked','python_columns']);assert.equal(generated.actions[1].checked,false);
});

test('declared column step is one owned page code with explicit native type codes',()=>{
 const binding={document_id:'doc',workflow_ref:{workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb',prefix:'MF;TF',navigation_path:[{tid:'x',label:'x'}]},node:{document_id:'doc',workflow_id:'wf',node_id:'py'}};
 const code=makePythonColumnsCode(binding,{columns:declared,operation_id:'op:n1',deadline:Date.now()+1000});
 assert.match(code,/^async page=>/);
 for(const [type,value] of Object.entries({integer:4,real:3,string:5,boolean:1,datetime:2}))assert.ok(code.includes('"type":"'+type+'","code":'+value));
 assert.throws(()=>makePythonColumnsCode(binding,{columns:[{name:'X',type:'variant'}]}),/supported types/);
});

test('existing code is replaced only against the readback digest',async()=>{
 const old='import builtin_data\n';
 const stale=fakeWizard({generation:true,source:old});
 await assert.rejects(configurePython(stale.channel,{source_text:pandas,expected_source_sha256:'0'.repeat(64)},{request:request('existing')}),/saved code changed/);
 assert.equal(stale.actions.some(a=>a.verb==='replace_expression'),false);
 const fresh=fakeWizard({generation:true,source:old});
 const result=await configurePython(fresh.channel,{source_text:pandas,expected_source_sha256:sha(old)},{request:request('existing')});
 assert.equal(result.configuration.previous_source_sha256,sha(old));assert.equal(result.configuration.source_sha256,sha(pandas));
 const kept=fakeWizard({generation:true,source:old});
 const unchanged=await configurePython(kept.channel,{},{request:request('existing')});
 assert.equal(unchanged.effect_possible,false);assert.equal(unchanged.configuration.schema_mode,'code');
});

test('readback is compact and output keeps declared order and types',async()=>{
 const node={document_id:'doc',workflow_id:'wf',node_id:'py'};
 const phases=['input_mapping','configure','node_finish','output_mapping','finish'].map(phase=>({phase,status:'verified',receipt_id:'op:'+phase,
  value:{verified:true,cleanup_complete:true,settings_applied:true,...(phase==='configure'?{validation:{status:'accepted_by_loginom_next'},
   configuration:{verified:true,schema_mode:'declared',columns:declared,source_sha256:sha(stdlib),source_utf8_bytes:512,source_lf_lines:14,separate_process:true,node_context:node}}:{})}}));
 const readback=pythonConfigurationReadback({node,phases,operation_id:'op'});
 assert.equal(readback.source_sha256,sha(stdlib));assert.equal(readback.execution_mode,'external_process');assert.equal(JSON.stringify(readback).includes('OutputTable'),false);
 const output=schema=>({schema,sample_complete:true});
 const channel={readOutputPort:async()=>({output:output(declared.map(({name,type})=>({name,type})))})};
 const ctx={execution:{execution_id:'e'},receipt_id:'r'};
 const configured={ports:[{port:0,schema:declared.map(({name,type})=>({name,type}))}]};
 assert.equal((await readPythonOutputs(channel,{ports:[0]},ctx,configured)).status,'complete');
 const coerced={readOutputPort:async()=>({output:output(declared.map(({name})=>({name,type:'string'})))})};
 await assert.rejects(readPythonOutputs(coerced,{ports:[0]},ctx,configured),/differs from the declared columns/);
 assert.equal((await readPythonOutputs(coerced,{ports:[0]},ctx,{ports:[{port:0,schema:null}]})).status,'complete');
});

test('existing node saved code is checked by python-module-v1 before Execute, not before Done',async()=>{
 const unsafe=fakeWizard({generation:true,source:'import os\nos.system("id")\n'});
 await assert.rejects(configurePython(unsafe.channel,{},{request:request('existing')}),/saved code refused by python-module-v1 \(module:os at line 1\)/);
 assert.equal(unsafe.actions.some(a=>a.expected_stage==='done'),false);
 const done=fakeWizard({generation:true,source:'import os\n'});
 assert.equal((await configurePython(done.channel,{},{request:request('existing',{finish:'done'})})).verified,true);
 const admitted=fakeWizard({generation:true,source:pandas});
 assert.equal((await configurePython(admitted.channel,{},{request:request('existing')})).configuration.source_sha256,sha(pandas));
});

test('declared columns refuse a usage role the Python columns step does not set',()=>{
 validatePythonParameters({source_text:stdlib,schema_mode:'declared',columns:declared.map(c=>({...c,usage:'Не задано'}))},'script',request());
 assert.throws(()=>validatePythonParameters({source_text:stdlib,schema_mode:'declared',columns:declared.map((c,i)=>({...c,usage:i?'Не задано':'Активное'}))},'script',request()),/usage Не задано/);
});

// Independent review of #1107: each source below was ADMITTED by python-module-v1.
for(const [source,reason] of [
 ['from pandas import read_csv\nframe = read_csv("http://h/x.csv")\n','attribute:read_csv'],
 ['from numpy import savetxt, load\n','attribute:savetxt'],
 ['import pandas as pd\nframe = (pd.\n    read_csv("/etc/passwd"))\n','attribute:read_csv'],
 ['frame.to_string("/tmp/x")\n','attribute:to_string'],
 ['import numpy as np\nnp.zeros(1).dump("/tmp/x")\n','attribute:dump'],
 ['import numpy as np\nnp.lib.format.open_memmap("/tmp/x", mode="w+", shape=(1,))\n','attribute:lib'],
 ['import pandas as pd\npd.io.common.urlopen("http://h")\n','attribute:io'],
 ['import numpy as np\nnp.testing\n','attribute:testing'],
 ['import numpy as np\nnp.f2py\n','attribute:f2py'],
 ['import numpy as np\nnp.ctypeslib\n','attribute:ctypeslib'],
 ['from numpy.lib.format import open_memmap\n','attribute:lib'],['from numpy import open_memmap\n','attribute:open_memmap'],
 ['ｅｖａｌ("1")\n','non_ascii'],
 ['x = ｏｐｅｎ("/etc/passwd").read()\n','non_ascii'],
 ['x = f"{"}" + str(__import__) + "{"}"\n','fstring_braces'],
 ['import operator\nf = operator.attrgetter("__globals__")\n','module:operator'],
 ['import string\nstring.Formatter().get_field("0.__globals__", (f,), {})\n','module:string'],
 ['import typing\ntyping.get_type_hints(f)\n','module:typing'],
 ['y = "{0.__globals__}".format(f)\n','string:__globals__'],
 ['y = f"{x!r} __class__"\n','string:__class__'],
 ['y = "{0.\\x5f_globals__}".format(f)\n','string:__globals__'],['y = "{0._" "_globals__}".format(f)\n','string:__globals__'],
 ['y = "{0.\\N{LOW LINE}_globals__}".format(f)\n','string:__globals__'],['y = f"{{0.\\x5f_globals__}}".format(f)\n','string:__globals__'],
 ['y = f"{{0.\\N{LOW LINE}_globals__}}".format(f)\n','string:__globals__'],
])test('review bypass refused: '+reason+' '+JSON.stringify(source.slice(0,40)),()=>{
 const policy=inspectPythonSourcePolicy(source);
 assert.equal(policy.status,'REFUSED',JSON.stringify(policy));assert.equal(policy.reason,reason);
});

test('f-string literal text, escaped braces and nested specs stay admitted; only their expressions are code',()=>{
 for(const source of ['label = f"Сумма {amount:.2f} руб."\n','x = f"{{literal}} {value}"\n','x = f"{value:{width}}"\n','x = rf"\\d{{2}} {n}"\n','x = f"""\n{a}\n"""\n'])
  assert.equal(inspectPythonSourcePolicy(source).status,'ADMITTED',source);
 assert.equal(inspectPythonSourcePolicy('x = f"{open(1)}"\n').reason,'name:open');
 assert.equal(inspectPythonSourcePolicy('x = f"{1}}"\n').reason,'fstring_braces');
});

// Fake columns page: Add → EditColumnDefForm → type picker → Apply. After each
// Apply, `cover` probes of elementFromPoint hit a foreign mask (closing editor),
// as on mas3 (LAB-1640: second Add refused 'Python column control covered').
function columnsPage({cover=0,coverAfterApply=false,missingType=null,deadline=Date.now()+20000}={}){
 const root='MF;TF;WizrdMCF',base=root+';PythonColumnsWizard',form=root+';EditColumnDefForm',els=new Map(),cmps=new Map();
 const names={1:'Логический',2:'Дата/Время',3:'Вещественный',4:'Целый',5:'Строковый'};
 const records=[],at=new Map();let open=false,pickerShown=false,draft=null,covering=coverAfterApply?0:cover,probes=0,clicks=0,ids=0;
 const el=(tid,x,y,visible=()=>true)=>{const e={id:'e'+(++ids),tid,getAttribute:k=>k==='data-tid'?tid:null,checkVisibility:()=>visible(),
  getBoundingClientRect:()=>({x:x-5,y:y-5,width:10,height:10}),contains:o=>o===e,closest:()=>e};if(tid)els.set(tid,e);at.set(x+','+y,e);return e;};
 const mask={className:'x-mask',closest:()=>null};
 const grid=el(base+';grdTargetColumns;tbl',300,300);cmps.set(grid.id,{el:{dom:grid},getStore:()=>({isLoading:()=>false,getData:()=>({items:records.map(data=>({data}))})})});
 el(base+';btnAddMappingColumn',10,10);
 const formEl=el(form,500,500,()=>open);
 const field=(key,get)=>{const e=el(form+';'+key,500,400+ids,()=>open);cmps.set(e.id,{el:{dom:e},getValue:get,getRawValue:get});};
 field('edtName',()=>draft?.name);field('edtDisplayName',()=>draft?.label);field('cbxDataKind',()=>'Непрерывный');
 const pickerEl=el(null,700,700,()=>pickerShown),types=Object.entries(names).filter(([v])=>Number(v)!==missingType).map(([v,t])=>({data:{Value:Number(v),DisplayText:t}}));
 const nodes=types.map((r,i)=>{const n=el(null,700,720+i*20,()=>pickerShown);n.record=r;return n;});
 const combo=el(form+';cbxDataType',500,600,()=>open);
 cmps.set(combo.id,{el:{dom:combo},getValue:()=>draft?.type,getStore:()=>({getData:()=>({items:types})}),picker:{el:{dom:pickerEl},getNode:r=>nodes.find(n=>n.record===r),getRecord:n=>n.record}});
 const document={querySelectorAll:q=>{const e=els.get(JSON.parse(q.slice(10,-1)));return e?[e]:[];},
  elementFromPoint:(x,y)=>{probes++;if(covering>0){covering--;return mask;}return at.get(x+','+y)??null;}};
 const context=vm.createContext({document,Ext:{getCmp:id=>cmps.get(id)}});
 const page={
  evaluate:async(fn,arg)=>{try{return await vm.runInContext('('+fn.toString()+')',context)(arg);}catch(error){throw Error('page.evaluate: Error: '+error.message);}},
  waitForTimeout:async ms=>new Promise(r=>setTimeout(r,Math.min(ms,5))),
  mouse:{click:async(x,y)=>{clicks++;const e=at.get(x+','+y);
   if(e?.tid===base+';btnAddMappingColumn'){open=true;draft={name:'',label:'',type:6};}
   else if(e?.record&&pickerShown){draft.type=e.record.data.Value;pickerShown=false;}
   else throw Error('click outside a control');}},
  locator:selector=>{const tid=JSON.parse(selector.slice(10,selector.indexOf(']')));const key=tid.slice(form.length+1);return {
   count:async()=>open&&['edtName','edtDisplayName'].includes(key)?1:0,
   fill:async v=>{draft[key==='edtName'?'name':'label']=v;},press:async()=>{},
   click:async()=>{if(!open)throw Error('hidden');if(key==='cbxDataType;trg_picker')pickerShown=true;
    else if(key==='btnApply'){records.push({Name:draft.name,DisplayName:draft.label,DataType:draft.type});open=false;draft=null;if(coverAfterApply)covering=cover;}
    else if(key==='btnCancel'){open=false;draft=null;}},
   waitFor:async()=>{}};}};
 const task={binding:{workflow_ref:{prefix:'MF;TF'}},columns:declared.map(c=>({...c,code:{integer:4,real:3,string:5,boolean:1,datetime:2}[c.type]})),deadline};
 const readNode=async()=>({verified:true,surface:'wizard',document_id:'doc',workflow_id:'wf',node_id:'py'});
 return {run:()=>configurePythonColumnsPage(page,task,readNode),records,get probes(){return probes;}};
}

test('declared columns wait out a transient cover over Add after Apply and still refuse a lasting one',{timeout:30000},async()=>{
 const transient=columnsPage({cover:3,coverAfterApply:true});
 const ok=await transient.run();
 assert.equal(ok.status,'SUCCEEDED',ok.error);assert.deepEqual(JSON.parse(JSON.stringify(ok.columns)),declared);
 const lasting=columnsPage({cover:1e9,coverAfterApply:true,deadline:Date.now()+20000}),started=Date.now();
 const refused=await lasting.run();
 assert.equal(refused.status,'AMBIGUOUS');assert.equal(refused.cleanup_complete,true);assert.equal(lasting.records.length,1);
 assert.match(refused.error,/Python column control covered by x-mask/);
 assert.ok(Date.now()-started<15000,'a lasting cover is refused before the operation deadline');
});

test('declared columns refuse at once when the open type picker lacks the wanted option',async()=>{
 const f=columnsPage({missingType:2,deadline:Date.now()+3000}),started=Date.now();
 const r=await f.run();
 assert.equal(r.status,'AMBIGUOUS');assert.match(r.error,/type option missing: Дата\/Время/);assert.equal(r.cleanup_complete,true);
 assert.ok(Date.now()-started<1500,'no polling until the deadline');
});
