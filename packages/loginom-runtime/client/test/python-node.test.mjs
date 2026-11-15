import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {inspectPythonSourcePolicy as inspectPolicy,pythonCodeSkeleton} from '../lib/python-source-policy.mjs';
import {execFileSync} from 'node:child_process';
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
// Every source checked in this file; the last test compares their skeletons with Python's tokenizer.
const corpus=new Set();
const inspectPythonSourcePolicy=source=>{corpus.add(source);return inspectPolicy(source);};
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
 ['x = f"{"}" + str(__import__) + "{"}"\n','name:__import__'],
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

// LAB-1641 re-review: raw-string skeleton desync and modules reached through
// attributes of admitted modules (each line ran os.system before the fix).
for(const [source,reason] of [
 ['x = r"\\" # " ; import os; os.system("id")\n','module:os'],
 ['y = 0 or"\\" # " ; import os\n','module:os'],
 ['import random\nrandom._os.system("id")\n','name:_os'],
 ['from random import _os\n','name:_os'],
 ['import random\nx = (random.\n    _os)\n','name:_os'],
 ['import collections\ncollections._sys.modules["os"].popen("id")\n','name:_sys'],
 ['import statistics\nstatistics.sys.modules["os"].system("id")\n','name:sys'],
 ['import re\nre.enum.sys.modules["os"].system("id")\n','name:sys'],
 ['import json\njson.codecs.sys.modules["os"].system("id")\n','name:sys'],
 ['import collections\ncollections._sys.modules["importlib"].import_module("subprocess")\n','name:_sys'],
 ['import collections\ncollections._sys.modules["io"].FileIO("/etc/passwd")\n','name:_sys'],
 ['import collections\ncollections._sys.modules["pickle"].loads(b"x")\n','name:_sys'],
 ['x = pickle.loads(b"x")\n','name:pickle'],
 ['m = modules["os"]\n','name:modules'],
 ['x = builtins\n','name:builtins'],
 ['x = popen\n','name:popen'],
 ['x = subprocess\n','name:subprocess'],
 ['x = os\n','name:os'],
 ['x = system\n','name:system'],
 ['df.query(\'@random._os.system("id") == 0\', engine=\'python\')\n','name:query'],
 ['y = ("{0._" + "_globals__}").format(f)\n','string:__globals__'],
])test('LAB-1641 bypass refused: '+reason+' '+JSON.stringify(source.slice(0,48)),()=>{
 const policy=inspectPythonSourcePolicy(source);
 assert.equal(policy.status,'REFUSED',JSON.stringify(policy));assert.equal(policy.reason,reason);
});

test('legitimate code stays admitted: double underscores inside names, raw/f strings, Cyrillic text, _ loop variable, json.loads',()=>{
 for(const source of ['df.columns = ["value__sum", "value__mean"]\n','x = "a__b__c"\n','label = "Сумма заказа"\n','label = f"{v:,.2f} руб."\n',
  'x = rf"\\d+ {n}"\n','x = r"C:\\dir\\\\"\n','for _ in range(3):\n    pass\n','import json\nrows = json.loads("[1, 2]")\n','x = rb"\\x00"\ny = Rb"a" + bR"b" + U"c"\n'])
  assert.equal(inspectPythonSourcePolicy(source).status,'ADMITTED',source);
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

// LAB-1680: module members are allowlisted. Each source below was ADMITTED by
// the denylist-only python-module-v1 (np.fromregex and pd.ExcelFile read files).
for(const [source,reason] of [
 ['import numpy as np\nrows = np.fromregex("/etc/passwd", r"(\\w+):", [("u", "U32")])\n','attribute:numpy.fromregex'],
 ['import pandas as pd\nx = pd.ExcelFile("/srv/secret.xlsx").parse(0)\n','attribute:pandas.ExcelFile'],
 ['from numpy import fromregex\n','attribute:numpy.fromregex'],
 ['from numpy import (array,\n    fromregex)\n','attribute:numpy.fromregex'],
 ['from numpy import \\\n    fromregex\n','attribute:numpy.fromregex'],
 ['import numpy as np\nx = (np.\n    fromregex)\n','attribute:numpy.fromregex'],
 ['import numpy as np\nx = (np\n    .fromregex)\n','attribute:numpy.fromregex'],
 ['import numpy as np\nx = np . fromregex\n','attribute:numpy.fromregex'],
 ['import numpy as np\nx = f"{np.fromregex(1)}"\n','attribute:numpy.fromregex'],
 ['from pandas import ExcelFile as E\n','attribute:pandas.ExcelFile'],
 ['from numpy.ma.mrecords import fromtextfile\n','attribute:numpy.ma.mrecords'],
 ['import numpy.ma.mrecords as m\n','attribute:numpy.ma.mrecords'],
 ['import numpy as np\nx = np.ma.mrecords.fromtextfile("/etc/passwd")\n','attribute:numpy.ma.mrecords'],
 ['import numpy as np\nx = np.rec.fromrecords([])\n','attribute:numpy.rec'],
 ['import pandas as pd\nx = pd.api.extensions\n','attribute:pandas.api.extensions'],
 ['import pandas as pd\nx = pd.plotting\n','attribute:pandas.plotting'],
 ['import numpy as np\nnp.show_config()\n','attribute:numpy.show_config'],
 ['import math\nx = math.no_such_name\n','attribute:math.no_such_name'],
 ['from numpy import *\n','attribute:numpy.*'],
 ['import numpy as np\nf = np\nf.fromregex("/etc/passwd", "x", [])\n','module_value:numpy'],
 ['import numpy as np\nr = np.random\n','module_value:numpy.random'],
 ['import numpy as np\nprint(np)\n','module_value:numpy'],
 ['import datetime\nfrom datetime import datetime\n','alias:datetime'],
 ['import numpy as random\nfrom random import random\n','alias:random'],
])test('module member allowlist refuses '+reason+' '+JSON.stringify(source.slice(0,40)),()=>{
 const policy=inspectPythonSourcePolicy(source);
 assert.equal(policy.status,'REFUSED',JSON.stringify(policy));assert.equal(policy.reason,reason);
});

test('module member allowlist admits computation code, aliases, submodules and from-imported classes',()=>{
 for(const source of [
  'import json\nimport math\nfrom collections import Counter\nimport datetime\nrows = json.loads("[1, 2]")\ny = math.sqrt(2)\nc = Counter(rows)\nnow = datetime.datetime.now()\n',
  'from datetime import datetime, timedelta\nx = datetime.now() + timedelta(days=1)\n',
  'import datetime as dt\nx = dt.date(2024, 1, 1) - dt.timedelta(days=1)\n',
  'import pandas as pd\nimport numpy as np\nfrom builtin_data import InputTable, OutputTable\nfrom builtin_pandas_utils import to_data_frame, prepare_compatible_table, fill_table\n'+
   'df = to_data_frame(InputTable, True)\ndf["d"] = pd.to_datetime(df["d"])\ndf["n"] = pd.to_numeric(df["n"], errors="coerce")\n'+
   'df["k"] = np.where(df["n"] > 0, "pos", np.nan)\ndf["s"] = np.select([df["n"] > 1], ["big"], default="small")\n'+
   'g = df.groupby("k").agg(total=("n", "sum"), avg=("n", "mean")).reset_index()\ng["b"] = pd.cut(g["total"], bins=3)\n'+
   'm = pd.merge(df, g, on="k", how="left")\nm = pd.concat([m, m], ignore_index=True)\nm = m[pd.notna(m["d"]) & ~pd.isna(m["n"])]\n'+
   'm["e"] = m["d"] + pd.Timedelta(days=1) + pd.offsets.MonthEnd(0)\nprepare_compatible_table(OutputTable, m, with_index=False)\nfill_table(OutputTable, m, with_index=False)\n',
  'import numpy as np\nrng = np.random.default_rng(1)\nx = (np.\n    linalg.norm(np.array([3, 4])))\ny = np.round(np.mean(np.arange(10)), 2)\n',
  'from numpy import random as npr, where\nx = where(npr.default_rng(1).random(3) > 0.5, 1, 0)\n',
  'import pandas as pd\nok = pd.api.types.is_numeric_dtype(pd.Series([1]))\n',
  'import collections.abc\nok = isinstance({}, collections.abc.Mapping)\n',
  'import fractions as f\nx = f"{1}" + str(f.Fraction(1, 3))\n',
  'import re\nx = re.sub(r"\\s+", " ", "a  b")\nlabel = f"{1234.5:,.2f} руб."\nfor _ in range(3):\n    pass\n',
  'import statistics, itertools, functools, random, decimal, cmath\nx = statistics.median([1, 2])\ny = list(itertools.chain([1], [2]))\n'+
   'z = functools.reduce(lambda a, b: a + b, y)\nrandom.seed(1)\nd = decimal.Decimal("1.5").quantize(decimal.Decimal("1"), rounding=decimal.ROUND_HALF_UP)\nc = cmath.sqrt(-1)\n',
  'try:\n    pass\nexcept ValueError as error:\n    raise RuntimeError("x") from error\n',
 ])assert.equal(inspectPythonSourcePolicy(source).status,'ADMITTED',source+JSON.stringify(inspectPythonSourcePolicy(source)));
});

test('allowlist refusal tells the model which member is refused and what to use instead',()=>{
 assert.throws(()=>validatePythonParameters({source_text:'import numpy as np\nx = np.fromregex("f", "x", [])\n',schema_mode:'code'},'script',request()),
  /python-module-v1 \(attribute:numpy\.fromregex at line 2\): numpy\.fromregex is not an allowed module member .*np\.where.*boolean mask/);
 assert.throws(()=>validatePythonParameters({source_text:'import numpy as np\nf = np\n',schema_mode:'code'},'script',request()),/module_value:numpy at line 2\): use the module only as alias\.member/);
 assert.throws(()=>validatePythonParameters({source_text:'import datetime\nfrom datetime import datetime\n',schema_mode:'code'},'script',request()),/alias:datetime\): datetime is imported as two different things; import it once/);
});

// LAB-1680 re-review: a string literal inside an f-string field closed the
// field early ('}' … '{'), so the code between was blanked as literal text and
// no name check saw it. Each source below was ADMITTED and ran its code.
for(const [source,reason] of [
 ['r = f"{\'}\' and exec(\'import os; os.system(chr(105)+chr(100))\') and \'{\'}"\n','name:exec'],
 ['r = f\'{"}" and open(chr(47)+chr(101)+chr(116)+chr(99)).read() and "{"}\'\n','name:open'],
 ['r = rf"{\'}\' and eval(chr(49)) and \'{\'}"\n','name:eval'],
 ['r = fr"{\'}\' and eval(chr(49)) and \'{\'}"\n','name:eval'],
 ['r = f"""{\'}\' and eval(chr(49)) and \'{\'}"""\n','name:eval'],
 ['r = f\'\'\'{"""}""" and eval(chr(49)) and """{"""}\'\'\'\n','name:eval'],
 ['r = f"{"}" and eval(chr(49)) and "{"}"\n','name:eval'],
 ['r = f"{f\'{eval(chr(49))}\'}"\n','name:eval'],
 ['r = f"{f\'{\'}\'}\' and eval(chr(49))}"\n','name:eval'],
 ['r = f"{x:{\'}\'}} {eval(chr(49))}"\n','name:eval'],
 ['r = f"{x:{eval(chr(49))}}"\n','name:eval'],
 ['r = f"{(lambda: \'}\')() and eval(chr(49))}"\n','name:eval'],
 ['r = f"{x # }\n and eval(chr(49))}"\n','name:eval'],
 ['r = f"\\{eval(chr(49))}}}"\n','name:eval'],
 ['import numpy as np\nr = f"{\'}\' and np.fromregex(\'/etc/passwd\', \'x\', []) and \'{\'}"\n','attribute:numpy.fromregex'],
])test('f-string field literal bypass refused: '+reason+' '+JSON.stringify(source.slice(0,44)),()=>{
 const policy=inspectPythonSourcePolicy(source);
 assert.equal(policy.status,'REFUSED',JSON.stringify(policy));assert.equal(policy.reason,reason);
});

test('f-string field code stays visible to the name checks',()=>{
 const source='r = rf"{\'}\' and print(chr(80)+chr(87)+chr(78)+chr(68)) and \'{\'}"\n';
 assert.match(pythonCodeSkeleton(source).code,/and print\(chr\(80\)/);
 assert.equal(inspectPythonSourcePolicy(source).status,'ADMITTED');
 for(const source of ['x = f"{d[\'k\']}"\n','x = f"{\'a\' if x else \'b\'}"\n','x = f"{v:,.2f} руб."\n','x = f"{\'}\'}"\n','x = f"{x:{\'}\'}}"\n',
  'x = f"{x!r:>{w}}"\n','x = f"{a!=b}"\n','x = f"{x:\'>10}"\n','x = f"{x=}"\n','x = f"{d["k"]}"\n','x = f"""{\nx # c\n}"""\n','x = f"\\N{LOW LINE}{x}"\n'])
  assert.equal(inspectPythonSourcePolicy(source).status,'ADMITTED',source);
 assert.equal(inspectPythonSourcePolicy('x = f"{x:"}"\n').reason,'fstring_braces');
});

test('re.compile is admitted only as a member of re; the builtin compile stays refused',()=>{
 for(const source of ['import re\np = re.compile(r"\\d+")\n','import re as rx\np = rx.compile("a")\n',
  'import numpy as np\nimport pandas as pd\nx = np.int_(1) + np.uint(2)\nok = np.isdtype(np.dtype("int64"), "integral")\nt = pd.ArrowDtype\n'])
  assert.equal(inspectPythonSourcePolicy(source).status,'ADMITTED',source);
 for(const [source,reason] of [['c = compile("1", "f", "eval")\n','name:compile'],['from re import compile\n','name:compile'],
  ['x.compile("1")\n','name:compile'],['import numpy as np\nnp.compile\n','attribute:numpy.compile'],['import re\nx = (re.\n    compile)\n','name:compile']])
  assert.equal(inspectPythonSourcePolicy(source).reason,reason,source);
});

// Differential check: identifiers left in the skeleton are exactly Python's
// NAME tokens (code regions agree) for every source above that Python 3.12+
// tokenizes and the skeleton accepts.
test('skeleton code regions match python tokenize on the test corpus',t=>{
 const sources=[...corpus,stdlib,pandas];
 const script='import io,json,sys,tokenize\n'+
  'if sys.version_info<(3,12):print("null");sys.exit()\n'+
  'def names(s):\n try:return [t.string for t in tokenize.generate_tokens(io.StringIO(s).readline) if t.type==tokenize.NAME]\n except Exception:return None\n'+
  'print(json.dumps([names(s) for s in json.load(sys.stdin)]))\n';
 let expected;
 try{expected=JSON.parse(execFileSync('python3',['-I','-W','ignore','-c',script],{input:JSON.stringify(sources),encoding:'utf8'}));}catch{expected=null;}
 if(!expected){t.skip('python3 >= 3.12 unavailable');return;}
 let compared=0;
 for(const [index,source] of sources.entries()){
  const skeleton=pythonCodeSkeleton(source);
  if(!expected[index]||skeleton.error)continue;
  const names=[...skeleton.code.matchAll(/(?<![\p{L}\p{N}_])[\p{L}_][\p{L}\p{N}_]*/gu)].filter(m=>!(/^(?:[rRuUbBfF]|[rR][bBfF]|[bBfF][rR])$/.test(m[0])&&/["']/.test(skeleton.code[m.index+m[0].length]??''))).map(m=>m[0]);
  assert.deepEqual(names,expected[index],source);compared++;
 }
 t.diagnostic('compared '+compared+' of '+sources.length);assert.ok(compared>=100,'compared '+compared);
});

// LAB-1689: pandas dispatchers (agg/aggregate/transform/apply/filter, aggfunc of
// pivot_table/crosstab/NamedAgg) call getattr(obj, name) for a string function
// argument. Each source below was ADMITTED and, on pandas 3.1.1, the first ran
// `id` and the second wrote a file.
const dunder='u = chr(95) * 2\nexpr = "@o." + u+"class"+u + "." + u+"init"+u + "." + u+"globals"+u + "[\'sys\'].modules[\'os\'].system(\'id\')==0"\n';
for(const [source,reason] of [
 ['import pandas as pd\ndf = pd.DataFrame({"a": [1]})\n'+dunder+'df.agg("query", 0, expr, engine="python", local_dict={"o": df})\n','dispatch:agg'],
 ['df.agg("to_csv", 0, "out.csv")\n','dispatch:agg'],
 ['df.aggregate("to_csv", 0, "out.csv")\n','dispatch:aggregate'],
 ['df.transform("to_csv", 0, "out.csv")\n','dispatch:transform'],
 ['df.apply("to_csv", 0, args=("out.csv",))\n','dispatch:apply'],
 ['df.agg(func="query")\n','dispatch:agg'],
 ['df.groupby("k").agg("query")\n','dispatch:agg'],
 ['df.groupby("k")["b"].filter("to_csv", True, "out.csv")\n','dispatch:filter'],
 ['df.rolling(2).agg(["sum", "query"])\n','dispatch:agg'],
 ['df.resample("D").agg({"b": "query"})\n','dispatch:agg'],
 ['df.resample("D").transform(arg="query")\n','dispatch:transform'],
 ['df.expanding().aggregate({"b": ["sum", "to_csv"]})\n','dispatch:aggregate'],
 ['df.ewm(com=1).agg(("mean", "query"))\n','dispatch:agg'],
 ['df.groupby("k").agg(total=("b", "query"))\n','dispatch:agg'],
 ['df.groupby("k")["b"].agg(total="query")\n','dispatch:agg'],
 ['df.agg(None, total=("b", "query"))\n','dispatch:agg'],
 ['import pandas as pd\nx = pd.pivot_table(df, values="b", index="k", aggfunc="query")\n','dispatch:pivot_table'],
 ['import pandas as pd\nx = pd.pivot_table(df, "b", "k", None, "query")\n','dispatch:pivot_table'],
 ['x = df.pivot_table("b", "k", None, "query")\n','dispatch:pivot_table'],
 ['import pandas as pd\nx = pd.crosstab(df.k, df.c, df.b, aggfunc="query")\n','dispatch:crosstab'],
 ['from pandas import pivot_table as pt\nx = pt(df, aggfunc="to_csv")\n','dispatch:pivot_table'],
 ['import pandas as pd\nx = df.groupby("k").agg(total=pd.NamedAgg("b", "query"))\n','dispatch:NamedAgg'],
 ['from pandas import NamedAgg\nx = df.groupby("k").agg(total=NamedAgg(column="b", aggfunc="query"))\n','dispatch:NamedAgg'],
 ['f = "qu" + "ery"\ndf.agg(f, 0, "a")\n','dispatch:agg'],
 ['df.agg("qu" "ery", 0, "a")\n','dispatch:agg'],
 ['df.agg(f"query", 0, "a")\n','dispatch:agg'],
 ['df.agg("\\x71uery", 0, "a")\n','dispatch:agg'],
 ['df.agg(*["query", 0, "a"])\n','dispatch:agg'],
 ['df.agg(**{"func": "query"})\n','dispatch:agg'],
 ['df.agg("sum", *args)\n','dispatch:agg'],
 ['m = df.agg\nm("query", 0, "a")\n','dispatch:agg'],
 ['m = df.agg\n("sum")\nm("query", 0, "a")\n','dispatch:agg'],
 ['x = list(map(df.agg, ["query"]))\n','dispatch:agg'],
 ['import functools\np = functools.partial(df.agg, "query")\n','dispatch:agg'],
 ['import pandas as pd\nx = df.pipe(pd.DataFrame.agg, "query", 0, "a")\n','dispatch:agg'],
 ['import pandas as pd\nx = pd.DataFrame.agg(df, "query", 0, "a")\n','dispatch:agg'],
 ['import pandas as pd\nf = pd.pivot_table\n','dispatch:pivot_table'],
 ['x = (df.agg)("query")\n','dispatch:agg'],
 ['str = "query"\ndf.agg(str, 0, "a")\n','dispatch:agg'],
 ['len = "query"\ndf.agg([len])\n','dispatch:agg'],
 ['str = "query"\ndf.agg(str.upper)\n','dispatch:agg'],
 ['def f(x):\n    return x\nf = "query"\ndf.agg(f, 0, "a")\n','dispatch:agg'],
 ['def f(x):\n    return x\ndef g(f):\n    return df.agg(f, 0, "a")\ng("query")\n','dispatch:agg'],
 ['def f(x):\n    return x\nh = lambda f: df.agg(f, 0, "a")\n','dispatch:agg'],
 ['def f(x):\n    return x\nh = (lambda a, f, b: df.agg(f, 0, "a"))(1, "query", 2)\n','dispatch:agg'],
 ['def f(x):\n    return x\nh = print(lambda a=lambda: 0, f, b: df.agg(f, 0, "a"))\n','dispatch:agg'],
 ['def f(x):\n    return x\nr = [df.agg(f, 0, "a") for f in ["query"]]\n','dispatch:agg'],
 ['def f(x):\n    return x\nr = sum(df.agg(f, 0, "a") for a, f, b in [(1, "query", 2)])\n','dispatch:agg'],
 ['def f(x):\n    return x\nif (f := "query"):\n    df.agg(f, 0, "a")\n','dispatch:agg'],
 ['def f(x):\n    return x\nfor f in ["query"]:\n    df.agg(f, 0, "a")\n','dispatch:agg'],
 ['def f(x):\n    return x\nf += "query"\ndf.agg(f, 0, "a")\n','dispatch:agg'],
 ['def f(x):\n    return x\na, f = 1, "query"\ndf.agg(f, 0, "a")\n','dispatch:agg'],
 ['dec = lambda _: "query"\n@dec\ndef f(x):\n    return x\ndf.agg(f, 0, "a")\n','dispatch:agg'],
 ['class f:\n    pass\ndf.agg(f)\n','dispatch:agg'],
 ['def f(x):\n    return x\nmatch 1:\n    case P(a, f):\n        df.agg(f)\n','dispatch:agg'],
 ['import numpy as np\ndf.agg(np.random)\n','module_value:numpy.random'],
 ['import pandas as pd\ndf.agg(pd.Series.query)\n','name:query'],
 ['import pandas as pd\ndf.agg(pd.Series.nunique)\n','dispatch:agg'],
 ['df.apply(str.format)\n','dispatch:apply'],
 ['df.apply(df.query)\n','name:query'],
 ['df.apply(getter)\n','dispatch:apply'],
 ['df.filter(cols)\n','dispatch:filter'],
])test('dispatcher function argument refused: '+reason+' '+JSON.stringify(source.slice(-48)),()=>{
 const policy=inspectPythonSourcePolicy(source);
 assert.equal(policy.status,'REFUSED',JSON.stringify(policy));assert.equal(policy.reason,reason);
});

test('dispatchers admit aggregation literals, lambdas, defs, builtins and module functions',()=>{
 for(const source of [
  'g = df.groupby("k").agg(["mean", "max"])\n',
  'g = df.groupby("k").agg({"b": "sum", "c": ["min", "max"]})\n',
  'g = df.groupby("k").agg(total=("b", "sum"), avg=("b", "mean"))\n',
  'g = df.groupby("k")["b"].agg(total="sum")\n',
  'import pandas as pd\ng = df.groupby("k").agg(total=pd.NamedAgg(column="b", aggfunc="sum"), n=pd.NamedAgg("b", "count"))\n',
  'df["s"] = df.apply(lambda r: r["a"] + r["b"], axis=1)\n',
  'df["u"] = df["t"].apply(str.upper)\n',
  'df["t"] = df["t"].astype(str).apply(str.strip)\nn = len(df)\n',
  'df["c"] = df.groupby("k")["b"].transform("cumsum")\n',
  'import pandas as pd\np = pd.pivot_table(df, values="b", index="k", columns="c", aggfunc="sum", fill_value=0)\nq = df.pivot_table(values="b", index="k", aggfunc=["sum", "mean"])\n',
  'import pandas as pd\nx = pd.crosstab(df.k, df.c)\ny = pd.crosstab(df.k, df.c, values=df.b, aggfunc="mean")\n',
  'import numpy as np\nimport pandas as pd\ndf["n"] = df["s"].apply(pd.to_numeric, errors="coerce")\nm = df.agg(np.mean)\nr = df.rolling(3).apply(np.nanmean, raw=True)\n',
  'from statistics import median\nm = df.groupby("k")["b"].agg(median)\n',
  'def label(row):\n    return "big" if row["b"] > 1 else "small"\ndf["l"] = df.apply(label, axis=1)\nprint(label(df.iloc[0]))\n',
  'names = df.groupby("k")["name"].agg(", ".join)\nlists = df.groupby("k")["b"].agg(list)\nn = df.groupby("k")["b"].agg(len)\n',
  'r = df.apply(lambda r: r * 2, result_type="expand", args=())\nz = df.resample("D").agg("sum")\nw = df.expanding().agg(["min", "max"])\n',
  'e = df.ewm(com=0.5).agg("mean")\nt = df.groupby("k").transform(lambda s: s - s.mean())\nh = df.groupby("k").filter(lambda g: len(g) > 1)\n',
  'a = df.filter(like="x")\nb = df.filter(["a", "b"])\nc = df.filter(items=cols, axis=1)\nd = df.filter(regex="^a")\n',
  'x = df.agg("sum", numeric_only=True)\ny = df.groupby("k").agg("std", ddof=0)\nz = df["b"].transform("rank", method="dense")\n',
  'k = list(filter(lambda v: v > 1, [1, 2]))\nagg = df.groupby("k").sum()\n',
  'x = df.groupby("k").agg(\n    total=("b", "sum"),\n)\ny = df.apply(\n    lambda r: r,\n    axis=1,\n)\n',
  'x = sorted(names, key=len)\ny = df["b"].map(lambda v: len(str(v)))\n',
 ])assert.equal(inspectPythonSourcePolicy(source).status,'ADMITTED',source+JSON.stringify(inspectPythonSourcePolicy(source)));
});

test('dispatch refusal tells the model which function arguments are allowed',()=>{
 assert.throws(()=>validatePythonParameters({source_text:'df.agg("query", 0, "a")\n',schema_mode:'code'},'script',request()),
  /python-module-v1 \(dispatch:agg at line 1\): the function argument of agg .*"sum".*lambda.*def/);
});
