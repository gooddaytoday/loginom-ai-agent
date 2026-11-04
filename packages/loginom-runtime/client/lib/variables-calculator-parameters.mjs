const requireValue=(ok,message)=>{if(!ok)throw Error('Variables calculator: '+message);};
const name=v=>typeof v==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(v);
const properties=['name','label','type','formula','description'];

export function validateVariablesCalculatorParameters(parameters,mode,request) {
 requireValue(mode==='expression','only native expression mode is supported');
 requireValue(parameters&&typeof parameters==='object'&&!Array.isArray(parameters)
  &&Object.keys(parameters).length===1&&Array.isArray(parameters.expressions)
  &&parameters.expressions.length>=1&&parameters.expressions.length<=32,'1–32 expressions required');
 requireValue(request?.target&&['new','existing'].includes(request.target.kind),'node target required');
 requireValue(Array.isArray(request.inputs)&&request.inputs.length===0,'table inputs are unsupported; use the variables port contract');
 requireValue(Array.isArray(request.mappings)&&request.mappings.length===0,'table mappings are unsupported');
 if(request.read!==undefined)requireValue(Array.isArray(request.read.ports)&&request.read.ports.length===0,'table output reads are unsupported; use read.variable_ports');
 const targets=new Set(),names=new Set();
 for(const e of parameters.expressions) {
  requireValue(e&&typeof e==='object'&&!Array.isArray(e)&&Object.keys(e).every(k=>['target',...properties].includes(k)),'unsupported expression parameter');
  const t=e.target;
  requireValue(t&&typeof t==='object'&&!Array.isArray(t)&&['new','existing'].includes(t.kind),'new/existing expression target required');
  if(t.kind==='new') {
   requireValue(Object.keys(t).length===1,'new target contains only kind');
   requireValue(['name','label','type','formula'].every(k=>Object.hasOwn(e,k)),'new expression requires name, label, type and formula');
  } else {
   requireValue(request.target.kind==='existing','new node cannot address saved expressions');
   requireValue(Object.keys(t).length===2&&name(t.name)&&!targets.has(t.name.toLowerCase()),'invalid or repeated saved expression target');
   targets.add(t.name.toLowerCase());
   requireValue(properties.some(k=>Object.hasOwn(e,k)),'empty expression patch');
  }
  if(e.name!==undefined){requireValue(name(e.name)&&!names.has(e.name.toLowerCase()),'invalid or duplicate expression name');names.add(e.name.toLowerCase());}
  if(e.label!==undefined)requireValue(typeof e.label==='string'&&e.label.length>0&&e.label.length<=120&&!/[\x00-\x1f]/.test(e.label),'invalid label');
  if(e.type!==undefined)requireValue(['integer','real','string','boolean'].includes(e.type),'unsupported type');
  if(e.formula!==undefined)requireValue(typeof e.formula==='string'&&e.formula.trim().length>0&&e.formula.length<=2048
   &&!/[\r\0]/.test(e.formula)&&e.formula.split('\n').length<=128,'bounded nonempty LF formula required');
  if(e.description!==undefined)requireValue(typeof e.description==='string'&&e.description.length<=512&&!/[\x00-\x08\x0b-\x1f]/.test(e.description),'invalid description');
 }
}

export function resolveVariablesCalculatorPatch(parameters,observed,{newNode=false}={}) {
 validateVariablesCalculatorParameters(parameters,'expression',{target:{kind:newNode?'new':'existing'},inputs:[],mappings:[]});
 requireValue(observed?.verified===true&&observed.inventory_complete===true&&observed.mode==='expression'
  &&Array.isArray(observed.expressions)&&observed.expressions.length>0&&observed.expressions.length<=32,'Complete observed expression inventory required');
 const baseline=structuredClone(observed.expressions);
 requireValue(baseline.every((e,i)=>e.index===i&&name(e.name)&&typeof e.record_id==='string'&&e.record_id.length>0
  &&typeof e.expression_id==='string'&&typeof e.formula==='string'&&typeof e.description==='string'&&typeof e.intermediate==='boolean')
  &&new Set(baseline.map(e=>e.record_id)).size===baseline.length&&new Set(baseline.map(e=>e.expression_id)).size===baseline.length
  &&new Set(baseline.map(e=>e.name.toLowerCase())).size===baseline.length,'invalid observed expression identities');
 if(newNode)requireValue(baseline.length===1&&baseline[0].name==='Expr1'&&baseline[0].formula===''
  &&baseline[0].type==='real'&&baseline[0].intermediate===false&&baseline[0].description==='','new-node default expression changed');
 const expressions=newNode?[]:structuredClone(baseline),changes=[];
 for(const [index,patch] of parameters.expressions.entries()) {
  const existing=patch.target.kind==='existing',matches=existing?baseline.filter(e=>e.name===patch.target.name):[];
  requireValue(!existing||matches.length===1,'saved expression is missing or ambiguous');
  const before=existing?matches[0]:newNode&&index===0?baseline[0]:null;
  const after=before?structuredClone(before):{description:'',intermediate:false};
  for(const key of properties)if(patch[key]!==undefined)after[key]=patch[key];
  if(existing)expressions[expressions.findIndex(e=>e.record_id===before.record_id)]=after;
  else expressions.push(after);
  changes.push({before,after,reuse_default:newNode&&index===0});
 }
 requireValue(expressions.length<=32&&new Set(expressions.map(e=>e.name.toLowerCase())).size===expressions.length,'expression name collision or count exceeded');
 // The native editor checks uniqueness on every Apply. Refuse rename chains
 // before mutation rather than temporarily renaming referenced expressions.
 for(const change of changes)requireValue(!baseline.some(e=>e.record_id!==change.before?.record_id&&e.name.toLowerCase()===change.after.name.toLowerCase()),'name is occupied by another saved expression');
 return {baseline,changes,expressions:expressions.map((e,index)=>({...e,index}))};
}
