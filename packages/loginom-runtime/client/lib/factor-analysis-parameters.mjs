const need=(v,m)=>{if(!v)throw Error('Factor analysis: '+m);};
export function validateFactorAnalysisParameters(p,mode,r){
 if(mode==='apply'){
  need(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).length===0,'apply requires parameters:{} to preserve saved settings');
  need(r.target.kind==='existing'&&r.inputs.length===0&&r.mappings.length===0&&r.finish==='execute','apply requires an existing trained node, inputs:[], mappings:[] and finish execute');
  need(r.read.ports.every(port=>port===0||port===1),'apply reads scores (0) and saved loadings (1)');return;
 }
 need(['pca_fixed','pca_eigenvalue','pca_variance'].includes(mode),'unsupported PCA mode');
 need(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>k==='factor_analysis'),'use parameters.factor_analysis only');
 const a=p.factor_analysis;
 need(a===undefined||a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).every(k=>['features','factors','rotation','eigenvalue','variance_percent','output_factors'].includes(k)),'unsupported PCA parameter');
 const selection={pca_fixed:'factors',pca_eigenvalue:'eigenvalue',pca_variance:'variance_percent'}[mode];
 need(r.target.kind==='existing'||a?.features!==undefined&&a?.[selection]!==undefined&&a?.rotation!==undefined,'new nodes require features, the mode threshold/count and rotation');
 need(['factors','eigenvalue','variance_percent'].every(k=>a?.[k]===undefined||k===selection),'only the selected criterion accepts a threshold/count');
 if(a?.features!==undefined)need(Array.isArray(a.features)&&a.features.length>=2&&a.features.length<=128&&a.features.every(f=>typeof f==='string'&&f.length>0&&f.length<=128)&&new Set(a.features).size===a.features.length,'distinct numeric technical feature names required');
 if(a?.factors!==undefined)need(Number.isSafeInteger(a.factors)&&a.factors>=1&&a.factors<=128&&(!a.features||a.factors<=a.features.length),'factor count must be 1..selected feature count');
 if(a?.eigenvalue!==undefined)need(Number.isFinite(a.eigenvalue)&&a.eigenvalue>=0.1&&a.eigenvalue<=1.5,'eigenvalue must be 0.1..1.5');
 if(a?.variance_percent!==undefined)need(Number.isFinite(a.variance_percent)&&a.variance_percent>=1&&a.variance_percent<=100,'variance_percent must be 1..100');
 if(a?.output_factors!==undefined)need(a.output_factors===false||Number.isSafeInteger(a.output_factors)&&a.output_factors>=1&&a.output_factors<=128,'output_factors must be false or 1..128');
 need(a?.rotation===undefined||['none','varimax','quartimax'].includes(a.rotation),'rotation must be none, varimax or quartimax (Kaiser normalization)');
 need(r.inputs.length<=1&&r.inputs.every(i=>i.input===0)&&(r.target.kind==='existing'||r.inputs.length===1),'one input at port 0 required');
 need(r.mappings.length===0,'explicit stable native output mappings are managed by this handler');
 need(r.read.ports.every(p=>p===0||p===1),'scores port 0 and loadings port 1 only');
}
export function resolveFactorAnalysisFeatures(p,fields){
 const names=p.factor_analysis?.features;if(!names)return;
 need(names.every(name=>fields.some(f=>f.name===name&&['integer','real'].includes(f.type)&&f.data_kind==='Непрерывный')),'continuous numeric input features required');
 need(JSON.stringify(fields.filter(f=>names.includes(f.name)).map(f=>f.name))===JSON.stringify(names),'features must follow input field order');
}
