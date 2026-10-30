const need=(v,m)=>{if(!v)throw Error('Correlation analysis: '+m);};
export function validateCorrAnalysisParameters(p,mode,r){
 need(mode==='pearson','only pearson is supported');
 need(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>['first_set','second_set'].includes(k)),'use first_set and second_set only');
 need(r.target.kind==='existing'||p.first_set!==undefined&&p.second_set!==undefined,'new nodes require both field sets');
 for(const key of ['first_set','second_set'])if(p[key]!==undefined)need(Array.isArray(p[key])&&p[key].length>0&&p[key].length<=128&&p[key].every(n=>typeof n==='string'&&n.length>0&&n.length<=128)&&new Set(p[key]).size===p[key].length,key+' must contain distinct technical field names');
 need(r.inputs.length<=1&&r.inputs.every(i=>i.input===0)&&(r.target.kind==='existing'||r.inputs.length===1),'one table input at port 0 required');
 need(r.mappings.length===0,'mapping overrides are unsupported');
 need(r.read.ports.every(i=>i===0),'only output port 0 exists');
}
export function resolveCorrAnalysisSets(p,fields){
 const result=fields.map(f=>({...f,...Object.fromEntries(['first_set','second_set'].map(k=>[k,p[k]===undefined?f[k]:p[k].includes(f.name)]))}));
 for(const key of ['first_set','second_set']){
  if(p[key])need(p[key].every(n=>fields.some(f=>f.name===n)),key+' contains an unknown input field');
  const selected=result.filter(f=>f[key]);
  need(selected.length>0&&selected.every(f=>['integer','real'].includes(f.type)),key+' requires numeric input fields');
 }
 return result;
}
