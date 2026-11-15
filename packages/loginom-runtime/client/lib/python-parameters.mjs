import {inspectPythonSourcePolicy} from './python-source-policy.mjs';

// Executable rewrite advice for the module-member allowlist refusals.
const pythonRefusalHint=reason=>{
  const [kind,name]=String(reason??'').split(/:(.*)/s);
  if(kind==='attribute'&&name.includes('.'))return ': '+name+' is not an allowed module member (computation only, no file or network I/O);'+
    ' rewrite with allowed functions such as np.where, np.select, pd.to_datetime, pd.to_numeric, pd.concat, pd.merge, a boolean mask df[df["x"] > 0] or methods of the data';
  if(kind==='module_value')return ': use the module only as alias.member, for example np.where(...); do not assign, pass or reuse the module name as a variable';
  if(kind==='dispatch')return ': the function argument of '+name+' must be an aggregation literal such as "sum", "mean", "count", "nunique", "first" or "cumsum"'+
    ' (or a list or dict of them), a lambda, a def name, len/str/int/float/abs/round/bool or a module function such as np.mean;'+
    ' call '+name+'(...) directly, without *args/**kwargs, and do not store the method or a function name in a variable';
  if(kind==='alias')return ': '+name+' is imported as two different things; import it once, for example import datetime as dt and dt.datetime.now()';
  return '';
};

const need=(v,m)=>{if(!v)throw Error('Python: '+m);};
export const PYTHON_DECLARED_TYPES=Object.freeze({boolean:1,datetime:2,real:3,integer:4,string:5});

// Public shape is shared with JavaScript (source_text, expected_source_sha256,
// schema_mode, columns); Python-specific bounds and policy apply here, before
// any browser mutation.
export function validatePythonParameters(p,mode,r){
  need(mode==='script','programming.python requires mode script');
  need(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>['source_text','expected_source_sha256','schema_mode','columns'].includes(k)),
    'use source_text, expected_source_sha256, schema_mode and columns only');
  if(r.target.kind==='new'){
    need(typeof p.source_text==='string'&&p.source_text.length>0,'new node requires source_text');
    need(['declared','code'].includes(p.schema_mode),'new node requires schema_mode declared or code');
    need(p.expected_source_sha256===undefined,'expected_source_sha256 is only for an existing node');
  }else if(p.source_text!==undefined)need(typeof p.expected_source_sha256==='string','replacing existing code requires expected_source_sha256 from readback');
  if(p.schema_mode==='code')need(p.columns===undefined,'schema_mode code forbids columns; the script creates them');
  if(p.schema_mode==='declared'&&r.target.kind==='new')need(Array.isArray(p.columns)&&p.columns.length>0,'schema_mode declared requires columns');
  if(p.columns!==undefined){
    need(p.schema_mode==='declared','columns require schema_mode declared');
    need(Array.isArray(p.columns)&&p.columns.length<=64&&p.columns.every(c=>c&&typeof c.name==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(c.name)&&Object.hasOwn(PYTHON_DECLARED_TYPES,c.type)),
      'columns need name (Latin identifier) and type integer, real, string, boolean or datetime');
    need(new Set(p.columns.map(c=>c.name)).size===p.columns.length,'column names must be distinct');
    need(p.columns.every(c=>c.usage===undefined||c.usage==='Не задано'),'columns support only usage Не задано; Python declared columns keep the default role');
  }
  if(p.source_text!==undefined){
    const policy=inspectPythonSourcePolicy(p.source_text);
    need(policy.status==='ADMITTED','source refused by '+policy.policy+' ('+policy.reason+(policy.line?' at line '+policy.line:'')+')'+pythonRefusalHint(policy.reason)+'. Imports: builtin_data, builtin_pandas_utils, pandas, numpy, math, cmath, datetime, decimal, fractions, statistics, re, json, itertools, functools, collections, random; ASCII code outside strings and comments; known file, network, process, environment and reflection names (read_*, to_*, load, dump, io, lib, dunder names, also inside strings) are refused');
  }
  need(r.inputs.length<=1&&r.inputs.every(i=>i.input===0),'one optional table input at port 0');
  need(r.mappings.length===0,'mapping overrides are unsupported');
  need((r.read?.ports??[]).every(i=>i===0),'only output port 0 exists');
  need(r.read?.coverage!=='full','read.coverage full is unsupported; read sample_rows up to 100');
}
