const need=(v,m)=>{if(!v)throw Error('Factor analysis: '+m);};
export function validateFactorAnalysisParameters(p,mode,r){
 need(mode==='pca_fixed','only pca_fixed is supported');
 need(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>k==='factor_analysis'),'use parameters.factor_analysis only');
 const a=p.factor_analysis;
 need(a===undefined||a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).every(k=>['features','factors','rotation'].includes(k)),'unsupported PCA parameter');
 need(r.target.kind==='existing'||a?.features!==undefined&&a?.factors!==undefined&&a?.rotation!==undefined,'new nodes require features, factors and rotation');
 if(a?.features!==undefined)need(Array.isArray(a.features)&&a.features.length>=2&&a.features.length<=128&&a.features.every(f=>typeof f==='string'&&f.length>0&&f.length<=128)&&new Set(a.features).size===a.features.length,'distinct numeric technical feature names required');
 if(a?.factors!==undefined)need(Number.isSafeInteger(a.factors)&&a.factors>=1&&a.factors<=128&&(!a.features||a.factors<=a.features.length),'factor count must be 1..selected feature count');
 need(a?.rotation===undefined||a.rotation==='none','only rotation none is supported');
 need(r.inputs.length<=1&&r.inputs.every(i=>i.input===0)&&(r.target.kind==='existing'||r.inputs.length===1),'one input at port 0 required');
 need(r.mappings.length===0,'explicit stable native output mappings are managed by this handler');
 need(r.read.ports.every(p=>p===0||p===1),'scores port 0 and loadings port 1 only');
}
export function resolveFactorAnalysisFeatures(p,fields){
 const names=p.factor_analysis?.features;if(!names)return;
 need(names.every(name=>fields.some(f=>f.name===name&&['integer','real'].includes(f.type)&&f.data_kind==='Непрерывный')),'continuous numeric input features required');
 need(JSON.stringify(fields.filter(f=>names.includes(f.name)).map(f=>f.name))===JSON.stringify(names),'features must follow input field order');
}
