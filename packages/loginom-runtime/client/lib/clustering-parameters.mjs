export const clusteringNormalizations={none:{type:0,label:'Нет'},scale_minus_one_one:{type:2,label:'Масштабирование [-1;1]'},scale_zero_one:{type:3,label:'Масштабирование [0;1]'},absolute_scale:{type:4,label:'Абсолютное масштабирование'},standardize:{type:5,label:'Стандартизация'}};
const need=(value,message)=>{if(!value)throw Error('Clustering: '+message);};
export function validateClusteringParameters(p,mode,request){
 need(['k_means','g_means'].includes(mode),'only k_means and g_means are supported');
 const automatic=mode==='g_means';
 need(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>['features','seed','normalization',...(automatic?['min_clusters','max_clusters','threshold']:['clusters'])].includes(k)),'unsupported parameter for '+mode);
 need(request.target.kind==='existing'||p.features!==undefined&&(automatic?p.min_clusters!==undefined&&p.max_clusters!==undefined&&p.threshold!==undefined:p.clusters!==undefined),'new nodes require features and '+(automatic?'min_clusters, max_clusters, threshold':'clusters'));
 for(const key of ['min_clusters','max_clusters'])if(p[key]!==undefined)need(Number.isSafeInteger(p[key])&&p[key]>=1&&p[key]<=1000,key+' must be an integer from 1 to 1000');
 need(p.min_clusters===undefined||p.max_clusters===undefined||p.min_clusters<=p.max_clusters,'min_clusters must not exceed max_clusters');
 if(p.threshold!==undefined)need(typeof p.threshold==='number'&&Number.isFinite(p.threshold)&&p.threshold>0,'threshold must be a finite positive number');
 if(p.features!==undefined)need(Array.isArray(p.features)&&p.features.length>0&&p.features.length<=128&&p.features.every(f=>f&&Object.keys(f).sort().join(',')==='kind,name'&&f.kind==='input_field'&&typeof f.name==='string'&&f.name.length>0&&f.name.length<=128)&&new Set(p.features.map(f=>f.name)).size===p.features.length,'features must be distinct input_field names');
 if(p.clusters!==undefined)need(Number.isSafeInteger(p.clusters)&&p.clusters>=2&&p.clusters<=1000,'clusters must be an integer from 2 to 1000');
 if(p.seed!==undefined)need(Number.isSafeInteger(p.seed)&&p.seed>=0&&p.seed<=2147483647,'seed must be an integer from 0 to 2147483647');
 need(p.normalization===undefined||Object.hasOwn(clusteringNormalizations,p.normalization),'normalization must be none, scale_minus_one_one, scale_zero_one, absolute_scale or standardize');
 need(request.inputs.length<=1&&request.inputs.every(i=>i.input===0)&&(request.target.kind==='existing'||request.inputs.length===1),'one table input is required');
 need(request.mappings.length===0,'port mapping overrides are not supported in this clustering slice');
 need(request.read.ports.every(p=>p===0||p===1),'outputs are assignments (0) and centers (1)');
}
export function resolveClusteringFeatures(p,fields){
 const names=p.features?.map(f=>f.name);
 if(!names)return;
 need(names.every(name=>fields.some(f=>f.name===name&&['integer','real'].includes(f.type)&&f.data_kind==='Непрерывный')),'each feature must name a continuous numeric input field');
}
