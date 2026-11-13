import {inspectPythonSourcePolicy} from './python-source-policy.mjs';

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
  }
  if(p.source_text!==undefined){
    const policy=inspectPythonSourcePolicy(p.source_text);
    need(policy.status==='ADMITTED','source refused by '+policy.policy+' ('+policy.reason+(policy.line?' at line '+policy.line:'')+'). Allowed: InputTable/OutputTable from builtin_data, builtin_pandas_utils, pandas, numpy and computation modules; no files, network, processes, environments, reflection or package installation');
  }
  need(r.inputs.length<=1&&r.inputs.every(i=>i.input===0),'one optional table input at port 0');
  need(r.mappings.length===0,'mapping overrides are unsupported');
  need((r.read?.ports??[]).every(i=>i===0),'only output port 0 exists');
  need(r.read?.coverage!=='full','read.coverage full is unsupported; read sample_rows up to 100');
}
