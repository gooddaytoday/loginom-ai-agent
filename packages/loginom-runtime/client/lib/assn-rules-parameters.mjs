const need=(v,m)=>{if(!v)throw Error('Association rules: '+m);};
export function validateAssnRulesParameters(p,mode,request){
 need(mode==='fp_growth','only fp_growth training is supported');
 const keys=['transaction_field','item_field','min_support_pct','min_confidence_pct','max_items'];
 need(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>keys.includes(k)),'unsupported parameter');
 need(request.target.kind==='existing'||keys.every(k=>p[k]!==undefined),'new nodes require all five parameters');
 for(const k of ['transaction_field','item_field'])if(p[k]!==undefined)need(typeof p[k]==='string'&&p[k].length>0&&p[k].length<=128,'exact technical field names required');
 need(!p.transaction_field||!p.item_field||p.transaction_field!==p.item_field,'transaction and item fields must differ');
 for(const k of ['min_support_pct','min_confidence_pct'])if(p[k]!==undefined)need(typeof p[k]==='number'&&Number.isFinite(p[k])&&p[k]>=0&&p[k]<=100,k+' must be 0..100 percent');
 need(p.max_items===undefined||p.max_items===2,'max_items=2 is supported');
 need(request.inputs.length<=1&&request.inputs.every(i=>i.input===0)&&(request.target.kind==='existing'||request.inputs.length===1),'one main input is required; auxiliary input is unsupported');
 need(request.mappings.length===0,'mapping overrides are unsupported');
 need(request.read.ports.every(p=>p===0||p===1),'recommendation port 2 is not supported yet; read itemsets 0 and rules 1');
}
export function resolveAssnRulesRoles(p,fields){
 for(const k of ['transaction_field','item_field'])if(p[k]!==undefined)need(fields.some(f=>f.name===p[k]&&f.type==='string'&&f.data_kind==='Дискретный'),'roles must name discrete string fields');
}
