const need=(value,message)=>{if(!value)throw Error('Clustering: '+message);};
export function validateClusteringParameters(p,mode,request){
 need(mode==='k_means','only fixed k_means is supported');
 need(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>['features','clusters','seed','normalization'].includes(k)),'unsupported parameter; use features, clusters, seed and normalization none/standardize');
 need(request.target.kind==='existing'||p.features!==undefined&&p.clusters!==undefined,'new nodes require features and clusters');
 if(p.features!==undefined)need(Array.isArray(p.features)&&p.features.length>0&&p.features.length<=128&&p.features.every(f=>f&&Object.keys(f).sort().join(',')==='kind,name'&&f.kind==='input_field'&&typeof f.name==='string'&&f.name.length>0&&f.name.length<=128)&&new Set(p.features.map(f=>f.name)).size===p.features.length,'features must be distinct input_field names');
 if(p.clusters!==undefined)need(Number.isSafeInteger(p.clusters)&&p.clusters>=2&&p.clusters<=1000,'clusters must be an integer from 2 to 1000');
 if(p.seed!==undefined)need(Number.isSafeInteger(p.seed)&&p.seed>=0&&p.seed<=2147483647,'seed must be an integer from 0 to 2147483647');
 need(p.normalization===undefined||['none','standardize'].includes(p.normalization),'normalization must be none or standardize');
 need(request.inputs.length<=1&&request.inputs.every(i=>i.input===0)&&(request.target.kind==='existing'||request.inputs.length===1),'one table input is required');
 need(request.mappings.length===0,'port mapping overrides are not supported in this clustering slice');
 need(request.read.ports.every(p=>p===0||p===1),'outputs are assignments (0) and centers (1)');
}
export function resolveClusteringFeatures(p,fields){
 const names=p.features?.map(f=>f.name);
 if(!names)return;
 need(names.every(name=>fields.some(f=>f.name===name&&['integer','real'].includes(f.type)&&f.data_kind==='Непрерывный')),'each feature must name a continuous numeric input field');
}
