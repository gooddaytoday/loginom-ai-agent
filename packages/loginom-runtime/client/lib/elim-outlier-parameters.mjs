const need=(v,m)=>{if(!v)throw Error('Outlier: '+m);};
const keys=['fields','method','outlier_factor','extreme_factor','ordered'];
const policies=['keep','mean','median','most_probable','limit','delete','constant'];
export function validateElimOutlierPreview(p,fields){
 // Native Preview omits DataKind. Validate numeric names here; the complete
 // owned input mapping checks continuous kind before its Done/configuration.
 need(p.outlier.fields.every(name=>fields.some(f=>f.name===name&&['integer','real'].includes(f.type))),'preview fields must name numeric input fields');
}
export function validateElimOutlierParameters(p,mode,r){
 need(['detect','edit'].includes(mode),'use detect or edit with Train current input');
 need(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>k==='outlier'),'use parameters.outlier');
 const o=p.outlier??{};
 need(o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>keys.includes(k)||['outlier_policy','extreme_policy','outlier_constant','extreme_constant'].includes(k)),'unsupported outlier parameter');
 need(r.target.kind==='existing'||keys.every(k=>o[k]!==undefined),'new nodes require fields, method, outlier_factor, extreme_factor and ordered');
 for(const key of ['outlier_policy','extreme_policy']){
  if(mode==='edit'&&r.target.kind!=='existing')need(o[key]!==undefined,'new edit nodes require both policies');
  if(o[key]!==undefined)need((mode==='detect'?['keep']:policies).includes(o[key]),mode+' policy must be '+(mode==='detect'?'keep':policies.join(', ')));
 }
 for(const kind of ['outlier','extreme']){
  const value=o[kind+'_constant'],policy=o[kind+'_policy'];
  if(Object.hasOwn(o,kind+'_constant'))need(Number.isFinite(value)&&mode==='edit'&&(policy==='constant'||policy===undefined&&r.target.kind==='existing'),kind+'_constant requires a finite number and its own constant policy');
  if(policy==='constant'&&r.target.kind!=='existing')need(Number.isFinite(value),kind+'_constant is required');
 }
 if(o.fields!==undefined)need(Array.isArray(o.fields)&&o.fields.length>0&&o.fields.length<=128&&o.fields.every(f=>typeof f==='string'&&f.length>0&&f.length<=128)&&new Set(o.fields).size===o.fields.length,'fields must be distinct technical names');
 if(o.method!==undefined)need(['sd','iqr'].includes(o.method),'method must be sd or iqr');
 for(const key of ['outlier_factor','extreme_factor'])if(o[key]!==undefined)need(Number.isFinite(o[key])&&o[key]>=0,key+' must be finite and nonnegative');
 if(o.outlier_factor!==undefined&&o.extreme_factor!==undefined)need(o.extreme_factor>=o.outlier_factor,'extreme_factor must be at least outlier_factor');
 if(o.ordered!==undefined)need(typeof o.ordered==='boolean','ordered must be boolean');
 need(r.inputs.length<=1&&r.inputs.every(i=>i.input===0)&&(r.target.kind==='existing'||r.inputs.length===1),'one current table input is required');
 need(r.mappings.length===0,'mapping overrides are unsupported in detect');
 need(r.read.ports.every(p=>[0,1,2].includes(p)),'ports are 0 all rows, 1 outliers excluding extremes, 2 extremes');
}
export function resolveElimOutlierParameters(p,fields,old={}){
 const o={...old,...p.outlier};
 for(const kind of ['outlier','extreme']){
  const constant=kind+'_constant';
  if(o[kind+'_policy']==='constant')need(Number.isFinite(o[constant]),constant+' is required and must be finite');
  else{need(!Object.hasOwn(p.outlier??{},constant),constant+' requires its own constant policy');delete o[constant];}
 }
 need(Array.isArray(o.fields)&&o.fields.length>0&&o.fields.every(name=>fields.some(f=>f.name===name&&['integer','real'].includes(f.type)&&f.data_kind==='Непрерывный')),'fields must name continuous numeric input fields');
 if(o.extreme_factor!==undefined&&o.outlier_factor!==undefined)need(o.extreme_factor>=o.outlier_factor,'extreme_factor must be at least outlier_factor');
 return o;
}
