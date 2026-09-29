import {inspectJavascriptModulePolicy} from './javascript-module-policy.mjs';

const need=(ok,message)=>{if(!ok)throw Error(message);};
const fields=new Set(['source_text','expected_source_sha256','schema_mode','columns']);
const types=new Set(['integer','real','string','boolean','datetime']);
const kinds=new Set(['Неопределенное','Непрерывный','Дискретный']);
const usages=new Set(['Не задано','Активное','Выходное','Группа','Показатель','Транзакция','Элемент']);

// Pure admission before target placement or port mapping. Effective source for
// an unchanged existing node is intentionally deferred to an owned full read.
export function validateJavascriptParameters(parameters,mode,request) {
  need(mode==='script'&&request?.target?.type==='programming.javascript','JavaScript script mode required');
  need(parameters&&typeof parameters==='object'&&!Array.isArray(parameters)
    &&Object.keys(parameters).every(key=>fields.has(key)),'Invalid JavaScript parameters');
  const fresh=request.target.kind==='new',replacing=Object.hasOwn(parameters,'source_text');
  need(request.target.kind==='existing'||fresh,'JavaScript target kind required');
  need(!fresh||replacing&&parameters.schema_mode!==undefined,'New JavaScript requires source and schema mode');
  need(!Object.hasOwn(parameters,'expected_source_sha256')||!fresh&&replacing,'Expected source digest only accompanies existing replacement');
  need(!replacing||fresh||typeof parameters.expected_source_sha256==='string'
    &&/^[a-f0-9]{64}$/.test(parameters.expected_source_sha256),
    'Existing JavaScript replacement requires complete source digest');
  if(replacing){
    const policy=inspectJavascriptModulePolicy(parameters.source_text);
    need(policy.status==='ADMITTED','JavaScript source preflight refused: '+policy.reason);
  }
  need(parameters.schema_mode===undefined||['declared','code'].includes(parameters.schema_mode),'Invalid JavaScript schema mode');
  need(!Object.hasOwn(parameters,'columns')||parameters.schema_mode==='declared','Declared columns require explicit declared schema mode');
  need(parameters.schema_mode!=='code'||!Object.hasOwn(parameters,'columns'),'Code schema cannot declare wizard columns');
  need(!fresh||parameters.schema_mode!=='declared'||Array.isArray(parameters.columns)&&parameters.columns.length>0,
    'New declared JavaScript requires complete columns');
  if(parameters.columns!==undefined){
    // Current owned native-cache reader admits at most 64 fields. This is a
    // handler evidence bound, not a claim about Loginom's own column limit.
    need(Array.isArray(parameters.columns)&&parameters.columns.length>0&&parameters.columns.length<=64,
      'JavaScript declared column count outside verified native bound');
    const names=new Set();
    for(const column of parameters.columns){
      need(column&&typeof column==='object'&&!Array.isArray(column)
        &&Object.keys(column).sort().join(',')==='data_kind,label,name,type,usage',
        'Complete JavaScript declared column required');
      need(typeof column.name==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(column.name)
        &&!names.has(column.name.toLowerCase()),'Invalid or duplicate JavaScript column name');
      names.add(column.name.toLowerCase());
      need(typeof column.label==='string'&&column.label.length>0&&column.label.length<=120
        &&!/[\x00-\x1f]/.test(column.label),'Invalid JavaScript column label');
      need(types.has(column.type)&&kinds.has(column.data_kind)&&usages.has(column.usage),
        'Invalid JavaScript column type, kind or usage');
    }
  }
  need(Array.isArray(request.inputs)&&request.inputs.length<=1
    &&request.inputs.every(input=>input.input===0)
    &&(!fresh||request.inputs.length===1),'JavaScript requires one table input at port 0');
  need(Array.isArray(request.mappings)&&request.mappings.length<=2
    &&request.mappings.every(mapping=>mapping.port===0)
    &&(request.finish!=='close'||request.mappings.every(mapping=>mapping.direction!=='input')),
    'JavaScript accepts only input/output port 0; Close cannot commit input mapping');
  need(Array.isArray(request.read?.ports)&&request.read.ports.every(port=>port===0),
    'JavaScript has one tabular output at port 0');
}
