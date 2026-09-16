const requireValue=(ok,message)=>{if(!ok)throw Error(message);};
const name=v=>typeof v==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(v);
const types=['integer','real','string','boolean','datetime'];
const properties=['name','label','type','formula','replace'];

export function validateCalculatorParameters(parameters,mode,request) {
  requireValue(mode==='expression','Only Loginom expression syntax is supported');
  requireValue(parameters&&typeof parameters==='object'&&!Array.isArray(parameters)
    &&Object.keys(parameters).every(k=>['expressions','order'].includes(k))&&Array.isArray(parameters.expressions)
    &&parameters.expressions.length<=128,'Bounded calculator expressions required');
  requireValue(request.target.kind==='existing'||parameters.expressions.length>0,'A new calculator requires expressions');
  const targets=new Set(),names=new Set();
  for(const e of parameters.expressions) {
    requireValue(e&&typeof e==='object'&&!Array.isArray(e)&&Object.keys(e).every(k=>['target',...properties].includes(k)),'Invalid expression parameters');
    const t=e.target;
    requireValue(t&&((t.kind==='new'&&Object.keys(t).join(',')==='kind')
      ||t.kind==='existing'&&Object.keys(t).length===2&&name(t.name)),'Choose a new expression or an exact existing name');
    if(t.kind==='existing') {
      requireValue(request.target.kind==='existing','A new node cannot address an existing expression');
      requireValue(!targets.has(t.name.toLowerCase()),'Expression targeted more than once');targets.add(t.name.toLowerCase());
    } else requireValue(properties.every(k=>Object.hasOwn(e,k)),'New expression requires name, label, type, formula and replace');
    if(e.name!==undefined){requireValue(name(e.name)&&!names.has(e.name.toLowerCase()),'Invalid or duplicate expression name');names.add(e.name.toLowerCase());}
    if(e.label!==undefined)requireValue(typeof e.label==='string'&&e.label.length>0&&e.label.length<=200&&!/[\x00-\x1f]/.test(e.label),'Invalid expression label');
    if(e.type!==undefined)requireValue(types.includes(e.type),'Unsupported expression type');
    if(e.formula!==undefined)requireValue(typeof e.formula==='string'&&e.formula.trim().length>0&&e.formula.length<=2048
      &&!/[\r\0]/.test(e.formula)&&e.formula.split('\n').length<=128,'Bounded nonempty LF expression required');
    if(e.replace!==undefined)requireValue(typeof e.replace==='boolean','Expression replacement must be boolean');
  }
  if(parameters.order!==undefined)requireValue(Array.isArray(parameters.order)&&parameters.order.length>0&&parameters.order.length<=128
    &&parameters.order.every(name)&&new Set(parameters.order.map(n=>n.toLowerCase())).size===parameters.order.length,'Explicit unique expression order required');
  requireValue(request.inputs.length<=1&&request.inputs.every(i=>i.input===0),'Calculator accepts one table input');
  requireValue(request.read.ports.every(p=>p===0),'Calculator has one table output');
  requireValue(request.mappings.length<=2&&request.mappings.every(m=>m.port===0),'Calculator has one input and output mapping');
  requireValue(request.finish!=='close'||request.mappings.every(m=>m.direction!=='input'),
    'Close cannot combine a calculator draft with input mappings: Loginom commits the input in a separate wizard; use Done/Execute or omit input mappings');
}

// Resolve a patch against observed identities, preserving every unrequested
// property and expression. This plans only one calculator, never a scenario.
export function resolveCalculatorPatch(parameters,observed,inputFields,{newNode=false}={}) {
  requireValue(observed?.verified===true&&observed.inventory_complete===true&&observed.mode==='expression','Complete observed calculator required');
  requireValue(Array.isArray(inputFields)&&new Set(inputFields.map(f=>f.name.toLowerCase())).size===inputFields.length,'Unique observed input field names required');
  let baseline=structuredClone(observed.expressions);
  if(newNode) {
    requireValue(baseline.length===1&&baseline[0].name==='Expr1'&&baseline[0].formula===''
      &&baseline[0].type==='real'&&!baseline[0].replace&&!baseline[0].intermediate&&!baseline[0].cached&&baseline[0].description==='',
    'New calculator default expression changed');
  }
  const original=baseline;
  const resolved=newNode?[]:structuredClone(baseline),changes=[];
  for(const [index,patch] of parameters.expressions.entries()) {
    const existing=patch.target.kind==='existing';
    const matches=existing?original.filter(e=>e.name===patch.target.name):[];
    requireValue(!existing||matches.length===1,'Existing expression name is missing or ambiguous');
    const before=existing?matches[0]:newNode&&index===0?baseline[0]:null;
    const after=before?structuredClone(before):{intermediate:false,cached:false,description:'',replace:false};
    for(const key of properties)if(patch[key]!==undefined)after[key]=patch[key];
    // A new expression inherits no stale formula/options from another row.
    if(existing)resolved[resolved.findIndex(e=>e.record_id===before.record_id)]=after;else resolved.push(after);
    changes.push({before,after,reuse_default:newNode&&index===0});
  }
  requireValue(resolved.length>0&&resolved.length<=128,'Calculator expression count outside supported bounds');
  const finalNames=resolved.map(e=>e.name.toLowerCase());
  requireValue(new Set(finalNames).size===finalNames.length,'Expression name collides with an unrequested expression');
  for(const e of resolved) {
    const input=inputFields.find(f=>f.name.toLowerCase()===e.name.toLowerCase());
    if(e.replace)requireValue(input,'Replacement input field is missing');
    else requireValue(!input,'Added expression collides with an input field; explicitly choose replacement');
  }
  if(parameters.order) {
    requireValue(parameters.order.length===resolved.length&&parameters.order.every(n=>resolved.some(e=>e.name===n)),
      'Explicit order must include every resulting expression exactly once');
    resolved.sort((a,b)=>parameters.order.indexOf(a.name)-parameters.order.indexOf(b.name));
  }
  return {baseline,changes,expressions:resolved.map((e,index)=>({...e,index})),order:resolved.map(e=>e.name)};
}

// Loginom checks names on each Apply, not just the final inventory. Free a
// dependency first; break cycles with a reserved temporary name on the same
// record. Formulas and options are preserved during that temporary edit.
export function planCalculatorEdits(plan,inputFields) {
  const pending=structuredClone(plan.changes),current=structuredClone(plan.baseline),steps=[];
  const reserved=new Set([...current,...plan.expressions,...inputFields].map(e=>e.name.toLowerCase()));
  const occupied=change=>current.some(e=>e.record_id!==change.before?.record_id&&e.name.toLowerCase()===change.after.name.toLowerCase());
  let serial=0;
  while(pending.length) {
    const free=pending.findIndex(change=>!occupied(change));
    if(free>=0) {
      const [change]=pending.splice(free,1);steps.push(change);
      const index=current.findIndex(e=>e.record_id===change.before?.record_id);
      if(change.before)current[index]=change.after;else current.push({...change.after,record_id:'planned-new-'+serial++});
      continue;
    }
    const change=pending.find(c=>c.before&&c.before.name!==c.after.name);
    requireValue(change,'Calculator rename dependencies cannot be resolved');
    let temporary;do{temporary='DockExprTemp'+serial++;}while(reserved.has(temporary.toLowerCase()));
    reserved.add(temporary.toLowerCase());
    const after={...change.before,name:temporary};steps.push({before:change.before,after});
    current[current.findIndex(e=>e.record_id===after.record_id)]=after;change.before=after;
  }
  return steps;
}
