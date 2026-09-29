import {inspectJavascriptModulePolicy} from './javascript-module-policy.mjs';

const namePattern=/^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const scalarTypes=new Set(['integer','real','string','boolean','datetime']);
const dataKinds=new Set(['Неопределенное','Непрерывный','Дискретный']);
const usages=new Set(['Не задано','Активное','Выходное','Группа','Показатель','Транзакция','Элемент']);
const need=(ok,path)=>{if(!ok)throw Error('Invalid parameters.'+path);};
const shape=(value,keys,path)=>{
  need(value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).every(key=>keys.includes(key)),path);
};

// This preflight is pure. The browser boundary must still read the effective
// source of an existing node and recheck its digest/policy before every effect.
export function validateJavascriptParameters(parameters,mode,request) {
  need(mode==='script','mode');
  shape(parameters,['source_text','expected_source_sha256','schema_mode','columns'],'parameters');
  need(request?.target?.kind==='new'||request?.target?.kind==='existing','target.kind');
  need(Array.isArray(request.inputs)&&request.inputs.length<=1
    &&request.inputs.every(input=>input?.input===0),'inputs');
  if(request.target.kind==='new')need(request.inputs.length===1,'inputs');
  need(Array.isArray(request.mappings)&&request.mappings.length<=2
    &&request.mappings.every(mapping=>mapping?.port===0&&['input','output'].includes(mapping.direction))
    &&new Set(request.mappings.map(mapping=>mapping.direction)).size===request.mappings.length,'mappings');
  need(request.read&&Array.isArray(request.read.ports)
    &&request.read.ports.every(port=>port===0),'read.ports');
  if(request.finish==='close')need(request.inputs.length===0&&request.mappings.length===0,'finish');

  const hasSource=Object.hasOwn(parameters,'source_text');
  const hasExpected=Object.hasOwn(parameters,'expected_source_sha256');
  if(request.target.kind==='new')need(hasSource&&!hasExpected,'source_text');
  else need(hasSource===hasExpected,'expected_source_sha256');
  if(hasExpected)need(typeof parameters.expected_source_sha256==='string'
    &&/^[a-f0-9]{64}$/.test(parameters.expected_source_sha256),'expected_source_sha256');
  if(hasSource){
    need(typeof parameters.source_text==='string','source_text');
    const policy=inspectJavascriptModulePolicy(parameters.source_text);
    need(policy.status==='ADMITTED','source_text');
  }

  const hasMode=Object.hasOwn(parameters,'schema_mode');
  if(request.target.kind==='new')need(hasMode,'schema_mode');
  if(hasMode)need(['declared','code'].includes(parameters.schema_mode),'schema_mode');
  const hasColumns=Object.hasOwn(parameters,'columns');
  if(hasColumns)need(parameters.schema_mode==='declared','columns');
  if(parameters.schema_mode==='code')need(!hasColumns,'columns');
  if(request.target.kind==='new'&&parameters.schema_mode==='declared')need(hasColumns,'columns');
  if(!hasColumns)return parameters;
  need(Array.isArray(parameters.columns)&&parameters.columns.length>0&&parameters.columns.length<=1000,'columns');
  const names=new Set();
  parameters.columns.forEach((column,index)=>{
    const path='columns['+index+']';
    shape(column,['name','label','type','data_kind','usage'],path);
    need(Object.keys(column).length===5,path);
    need(typeof column.name==='string'&&namePattern.test(column.name)&&!names.has(column.name.toLowerCase()),path+'.name');
    names.add(column.name.toLowerCase());
    need(typeof column.label==='string'&&column.label.length>0&&column.label.length<=120
      &&column.label.isWellFormed()&&!/[\x00-\x1f\x7f]/.test(column.label),path+'.label');
    need(scalarTypes.has(column.type),path+'.type');
    need(dataKinds.has(column.data_kind),path+'.data_kind');
    need(usages.has(column.usage),path+'.usage');
  });
  return parameters;
}
